import { type Writable, writable, derived, get, type Readable } from "svelte/store";
import { type ListItem, type Option } from "$lib/searcher/item.ts";
import * as Db from "$lib/searcher/db.ts";
import { Innertube } from "youtubei.js/web";
import * as St from "$lib/searcher/song_tube.ts";
import * as Mbz from "$lib/searcher/mbz.ts";
import { exhausted } from "$lib/virtual.ts";
import { toast } from "./toast/toast";
import { type AutoplayQueryInfo, autoplay_searcher, AutoplayQueueManager } from "./local/queue.ts";
import { type Searcher, fused_searcher, type NewSearcher } from "./searcher/searcher.ts";
import { OptionsWrapper } from "./searcher/mixins.ts";
import * as icons from "$lib/icons.ts";
import * as types from "$types/types.ts";

export type DetailTab = {
    type: "detail",
    item: Writable<ListItem>,
    key: number;
    name: string;
};
export type BrowseTab = {
    type: "browse",
    key: number;
    name: string;
    searcher: Writable<Searcher>;
    new_searcher: NewSearcher | null;
    thumbnail: string | null; // TODO: don't need this to override thumbnail. do that using some kinda mixin
    query: Writable<string>;
    options: Readable<Option[]>;
};
export type Tab = DetailTab | BrowseTab;

export type MenubarOption = { name: string, key: number } & (
    | { content_type: "list"; type: Db.Typ | St.Typ | "YtVideo" | Mbz.SearchTyp | "covau-group" }
    | { content_type: "queue" }
    | { content_type: "watch" }
    | { content_type: "related-music", source: "Yt" | "Mbz" }
    | { content_type: "home-feed" }
);

let tab_key = 0;
export const new_key = () => {
    return tab_key++;
}

export type DragItem = {
    source_key: unknown;
    item: ListItem;
};
export type DragSource = {
    source_key: unknown;
    drop_callback: (() => Promise<void>) | (() => void); 
    drop_cleanup: (() => Promise<void>) | (() => void); 
};
export let drag_item: Writable<DragItem | null> = writable(null);
let drag_source: Writable<DragSource | null> = writable(null);
export const drag_ops = {
    async set_source(ds: DragSource | null) {
        let old_ds = get(drag_source);
        if (old_ds != null && (ds == null || ds.source_key != old_ds.source_key)) {
            await old_ds.drop_cleanup();
        }
        drag_source.set(ds);
    },
    async dragend() {
        setTimeout(async () => {
            drag_item.set(null)

            let ds = get(drag_source);
            if (ds) {
                await ds.drop_cleanup();
            }
            drag_source.set(null);
        }, 300);
    },
    async drop()  {
        let ds = get(drag_source);
        if (ds) {
            await ds.drop_callback();
            await ds.drop_cleanup();
        }
        drag_source.set(ds);
    },
};

// NOTE: initialized in wrap components
export let tube: Writable<Innertube> = writable();
export let query_input = writable("");

// export type Source = "Musicbrainz" | "Musimanager" | "Youtube";
// export let sources: Source[] = ["Musimanager", "Youtube", "Musicbrainz"]
// export let source: Writable<Source> = writable("Musimanager");

export type MetaBrowseQuery = (
    | ({ source: "Youtube" } & St.BrowseQuery)
    | ({ source: "Musimanager" } & Db.BrowseQuery)
    | ({ source: "Musicbrainz" } & Mbz.BrowseQuery)
);

export let menubar_options: Writable<MenubarOption[]> = writable([]);
export let selected_menubar_option_index = writable(-1);
export let selected_menubar_option: Readable<MenubarOption> = derived(
    [selected_menubar_option_index, tube],
    ([$index, _t]) => get(menubar_options)[$index],
);
export const insert_menu_item = (
    op: (MenubarOption | Omit<MenubarOption, "key">),
    index: number | null = null,
    switch_to: boolean = false,
) => {
    let i = index ?? get(menubar_options).length;
    let curr = get(selected_menubar_option_index);

    let option: MenubarOption;
    if ("key" in op) {
        option = op;
    } else {
        // @ts-ignore
        option = {
            key: new_key(),
            ...op,
        };
    }

    let options = get(menubar_options);
    options.splice(i, 0, option);

    if (curr >= i) {
        curr += 1;
    }
    if (switch_to) {
        curr = i;
    }

    menubar_options.set(options);
    selected_menubar_option_index.set(curr);
};
export const pop_menu_item = (key: number) => {
    let i = get(menubar_options).findIndex(o => o.key == key);
    if (i == -1) {
        toast(`menu option with key ${key} not found`, "error");
        return;
    }

    let curr = get(selected_menubar_option_index);
    let options = get(menubar_options);
    options.splice(i, 1);

    if (curr >= i) {
        curr -= 1;
    }
    if (curr < 0) {
        curr = 0;
    }

    menubar_options.set(options);
    selected_menubar_option_index.set(curr);
};

export let tabs: Writable<Tab[]> = writable([]);
export let curr_tab_index = writable(0);

export const new_detail_tab = (
    item: ListItem,
    name: string,
    append: boolean = true,
) => {
    let index = get(curr_tab_index);
    tabs.update(t => {
        if (append) {
            t = [...t.slice(0, index + 1)];
        } else {
            t = [];
        }

        let tab: DetailTab = {
            type: "detail",
            key: new_key(),
            name,
            item: writable(item),
        };

        t.push(tab);
        return t;
    });
    curr_tab_index.set(get(tabs).length - 1);
};
export const new_tab = (
    s: Searcher,
    title: string,
    thumb: string | null = null,
    query: string | null = null,
    new_searcher: NewSearcher | null = null,
    append: boolean = true,
) => {
    let index = get(curr_tab_index);
    tabs.update(t => {
        if (append) {
            t = [...t.slice(0, index + 1)];
        } else {
            t = [];
        }

        let q = writable(query ?? "");
        let searcher = writable(s);
        let ops = derived([searcher], ([s]) => s.options());
        ops.subscribe(() => update_current_tab());
        let tab: BrowseTab = {
            type: "browse",
            name: title,
            searcher: searcher,
            new_searcher: new_searcher,
            thumbnail: thumb,
            query: q,
            key: new_key(),
            options: ops,
        };
        q.subscribe(async (q) => {
            if (tab.new_searcher) {
                tab.searcher.set(await tab.new_searcher(q));
            }
        });

        t.push(tab);
        return t;
    });
    curr_tab_index.set(get(tabs).length - 1);
};
export const pop_tab = (index: number | null = null) => {
    let i = index ?? get(tabs).length - 1;

    let curr = get(curr_tab_index);
    let tabbs = get(tabs);
    tabbs.splice(i, 1);

    let new_curr: number;
    if (curr >= i) {
        new_curr = curr - 1;
    } else {
        new_curr = curr;
    }

    tabs.set(tabbs);
    curr_tab_index.set(new_curr);
};

let tab_updater = writable(0);
export let update_current_tab = () => {
    tab_updater.update(t => t+1);
};
export let curr_tab = derived(
    [tabs, curr_tab_index, tab_updater],
    ([$tabs, $index, _t]) => $tabs[$index],
);

export type MessageHandler = ((msg: types.server.PlayerMessage) => Promise<void>) | ((msg: types.server.PlayerMessage) => void);
export interface Player {
    play_item(item: ListItem): (Promise<void> | void);
    pause(): void;
    on_message(handler: MessageHandler): void;
    destroy(): Promise<void>;
    set_volume(v: number): void;
    seek_to_perc(t: number): (Promise<void> | void);
    toggle_pause(): void;
    toggle_mute(): void;
    is_playing(): boolean;
}
export interface Queue {
    detour(): void;
    play_item(item: ListItem): Promise<void>;
    add(...item: ListItem[]): Promise<void>;
    play_queue_item(item: ListItem): Promise<void>;
    remove_queue_item(item: ListItem): Promise<void>;
}

export let playing_item: Writable<ListItem> = writable();
// TODO: also allow sync/player
export let player: Writable<Player> = writable();
(async () => {
    let musiplayer = await import("$lib/local/player.ts");
    let pl = new musiplayer.Musiplayer();
    player.set(pl);
})()

export let queue: Writable<Queue> = writable(new AutoplayQueueManager());

export const queue_ops = {
    async detour(item: ListItem) {
        await get(queue).play_item(item);
        get(queue).detour();
        queue.update(q => q);
    },

    async add_item(...items: ListItem[]) {
        await get(queue).add(...items);
        queue.update(q => q);
    },

    async remove_item(item: ListItem) {
        await get(queue).remove_queue_item(item);
        queue.update(q => q);
    },

    async play_item(item: ListItem) {
        await get(queue).play_queue_item(item);
        queue.update(q => q);
    }
};


selected_menubar_option.subscribe(async (option) => {
    if (!get(tube)) {
        return;
    }
    let s: Searcher = fused_searcher;
    let new_searcher: ((q: string) => Promise<Searcher>) | ((q: string) => Searcher) | null = null;
    switch (option.content_type) {
        case "list": {
            switch (option.type) {
                case "MmSong":
                case "MmAlbum":
                case "MmArtist":
                case "MmPlaylist":
                case "MmQueue":
                case "Song":
                case "Playlist":
                case "Queue":
                case "Updater":
                case "StSong":
                case "StVideo":
                case "StAlbum":
                case "StPlaylist":
                case "StArtist": {
                    let type = option.type;
                    new_searcher = (q: string) => Db.Db.new({
                        query_type: "search",
                        type: type,
                        query: q,
                    }, 50);
                    s = new_searcher(get(query_input));
                } break;
                case "YtSong":
                case "YtAlbum":
                case "YtPlaylist":
                case "YtArtist": {
                    let type = option.type;
                    new_searcher = (q: string) => St.SongTube.new({
                        type: "Search",
                        content: {
                            query: q,
                            search: type, // trick it
                        },
                    });
                    s = new_searcher(get(query_input));
                } break;
                case "YtVideo": {
                    new_searcher = (q: string) => St.SongTube.new({
                        type: "VideoSearch",
                        content: {
                            query: q,
                        },
                    });
                    s = new_searcher(get(query_input));
                } break;
                case "MbzRadioSong":
                case "MbzReleaseWithInfo":
                case "MbzReleaseGroupWithInfo":
                case "MbzArtist":
                case "MbzRecordingWithInfo": {
                    let type = option.type;
                    new_searcher = (q: string) => Mbz.Mbz.new({
                        query_type: "search",
                        type: type,
                        query: q,
                    }, 50);
                    s = new_searcher(get(query_input));
                } break;
                case "covau-group": {
                    new_searcher = async (q: string) => {
                        if (q.length == 0) {
                            return fused_searcher;
                        }

                        let f_app = await import("firebase/app");
                        let f_store = await import("firebase/firestore");
                        let f_config = await import("../firebase_config");
                        let app = f_app.initializeApp(f_config.firebase_config);
                        let db = f_store.getFirestore(app);
                        let data_ref = f_store.doc(db, 'groups', q);
                        let data = await f_store.getDoc(data_ref);
                        let covau = data.data();
                        if (!covau) {
                            toast("could not load data", "error");
                            return fused_searcher;
                        }
                        let ids: string[] = covau.queue;
                        let wrapper = OptionsWrapper((old: Option[], s: Searcher) => {
                            old.push({
                                title: "add all to queue",
                                icon: icons.add,
                                location: "OnlyMenu",
                                onclick: async () => {
                                    let items = await s.next_page();
                                    await queue_ops.add_item(...items);
                                    toast("items added");
                                },
                            });
                            return old;
                        });
                        let s = St.SongTube.new({
                            type: "SongIds",
                            content: {
                                ids,
                                batch_size: 10,
                            },
                        }, wrapper);

                        return s;
                    }; 

                    s = await new_searcher(get(query_input));
                } break;
                default:
                    throw exhausted(option.type);
            }
            new_tab(
                s,
                "Results",
                null,
                get(query_input),
                new_searcher,
                false,
            );
        } break;
        case "queue":
            break
        case "watch":
            break
        case "related-music": {
            let item = get(playing_item);
            let query: AutoplayQueryInfo | null = null;

            switch (option.source) {
                case "Yt": {
                    query = await item.autoplay_query("StRelated");
                    if (!query) {
                        query = await item.autoplay_query("StSearchRelated");
                    }
                } break;
                case "Mbz": {
                    query = await item.autoplay_query("MbzRadio");
                } break;
                default:
                    throw exhausted(option.source);
            }

            if (query) {
                s = await autoplay_searcher(query);
            } else {
                toast("could not find related for " + item.title(), "error");
            }
            new_tab(
                s,
                "Related",
                null,
                null,
                null,
                false,
            );
        } break;
        case "home-feed": {
            let st = await import("$lib/searcher/song_tube.ts");
            let s = st.SongTube.new({
                type: "HomeFeed",
            });
            new_tab(
                s,
                "Home",
                null,
                null,
                null,
                false,
            );
        } break;
        default:
            throw exhausted(option);
    }
});
