import { type Writable, writable, derived, get, type Readable } from "svelte/store";
import { type ListItem } from "$lib/searcher/item.ts";
import * as Db from "$lib/searcher/db.ts";
import { Innertube } from "youtubei.js/web";
import * as St from "$lib/searcher/song_tube.ts";
import * as Mbz from "$lib/searcher/mbz.ts";
import { exhausted } from "$lib/virtual.ts";
import { Musiplayer } from "$lib/local/player.ts";
import { toast } from "./toast/toast";
import { type AutoplayQueryInfo, autoplay_searcher, AutoplayQueueManager } from "./local/queue.ts";
import { type Searcher, fused_searcher } from "./searcher/searcher.ts";

export type Tab = {
    name: string;
    searcher: Writable<Searcher>;
    new_searcher: ((q: string) => Promise<Searcher>) | ((q: string) => Searcher) | null;
    thumbnail: string | null;
    query: Writable<string>;
    key: number;
};

let tab_key = 0;
export function new_tab_key() {
    return tab_key++;
}

export type MenubarOption = { name: string } & (
    | { content_type: "list"; type: Db.Typ | St.Typ | Mbz.SearchTyp | "covau-group" }
    | { content_type: "queue" }
    | { content_type: "watch" }
    | { content_type: "related-music", source: "Yt" | "Mbz" }
    | { content_type: "home-feed" }
);

let page_size = 30;

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

export let menubar_options: Writable<MenubarOption[]> = writable([
    { name: "Home", content_type: "home-feed" },
    { name: "Mm Song", content_type: "list", type: "MmSong" },
    { name: "Mm Queues", content_type: "list", type: "MmQueue" },
    { name: "Mm Playlists", content_type: "list", type: "MmPlaylist" },
    { name: "Mm Artist", content_type: "list", type: "MmArtist" },
    { name: "Mm Album", content_type: "list", type: "MmAlbum" },
    { name: "Yt Song", content_type: "list", type: "YtSong" },
    { name: "Yt Video", content_type: "list", type: "YtVideo" },
    { name: "Yt Album", content_type: "list", type: "YtAlbum" },
    { name: "Yt Playlist", content_type: "list", type: "YtPlaylist" },
    { name: "Yt Artist", content_type: "list", type: "YtArtist" },
    { name: "St Song", content_type: "list", type: "StSong" },
    { name: "St Video", content_type: "list", type: "StVideo" },
    { name: "St Album", content_type: "list", type: "StAlbum" },
    { name: "St Playlist", content_type: "list", type: "StPlaylist" },
    { name: "St Artist", content_type: "list", type: "StArtist" },
    { name: "Song", content_type: "list", type: "Song" },
    { name: "Playlist", content_type: "list", type: "Playlist" },
    { name: "Queue", content_type: "list", type: "Queue" },
    { name: "Updater", content_type: "list", type: "Updater" },
    { name: "Mbz Recording", content_type: "list", type: "MbzRecordingWithInfo" },
    { name: "Mbz Release", content_type: "list", type: "MbzReleaseWithInfo" },
    { name: "Mbz ReleaseGroup", content_type: "list", type: "MbzReleaseGroupWithInfo" },
    { name: "Mbz Artist", content_type: "list", type: "MbzArtist" },
    { name: "Lbz Radio", content_type: "list", type: "MbzRadioSong" },
    { name: "Covau Group", content_type: "list", type: "covau-group" },
    { name: "Related", content_type: "related-music", source: "Yt" },
    { name: "Radio", content_type: "related-music", source: "Mbz" },
]);
export let selected_menubar_option_index = writable(0);
export let selected_menubar_option: Readable<MenubarOption> = derived(
    [menubar_options, selected_menubar_option_index, tube],
    ([$options, $index, _t]) => $options[$index],
);

export let tabs: Writable<Tab[]> = writable([]);
export let curr_tab_index = writable(0);
export const push_tab = (
    s: Searcher,
    title: string,
    thumb: string | null = null,
    query: string | null = null,
    new_searcher: (((q: string) => Promise<Searcher>) | ((q: string) => Searcher) | null) = null,
) => {
    let index = get(curr_tab_index);
    tabs.update(t => {
        t = [...t.slice(0, index + 1)];

        let q = writable(query ?? "");
        let tab: Tab = {
            name: title,
            searcher: writable(s),
            new_searcher: new_searcher,
            thumbnail: thumb,
            query: q,
            key: new_tab_key(),
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

export let curr_tab = derived(
    [tabs, curr_tab_index],
    ([$tabs, $index]) => $tabs[$index],
);

export interface Player {
    play(uri: string): (Promise<void> | void);
    pause(): void;
}

export let playing_item: Writable<ListItem> = writable();
// TODO: also allow sync/player
export let player: Writable<Player> = writable();
(async () => {
    let musiplayer = await import("$lib/local/player.ts");
    let pl = new musiplayer.Musiplayer();
    player.set(pl);
})()

export let queue: Writable<AutoplayQueueManager> = writable(new AutoplayQueueManager());

export const queue_ops = {
    async detour(item: ListItem) {
        await get(queue).play_item(item);
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
                    }, page_size);
                    s = new_searcher(get(query_input));
                } break;
                case "YtSong":
                case "YtVideo":
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
                    }, 30);
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
                        return St.SongTube.new({
                            type: "SongIds",
                            content: {
                                ids,
                                batch_size: 10,
                            },
                        });
                    }; 

                    s = await new_searcher(get(query_input));
                } break;
                default:
                    throw exhausted(option.type);
            }
            tabs.update(t => {
                let q = writable(get(query_input));
                let tab: Tab = {
                    name: "Results",
                    searcher: writable(s),
                    thumbnail: null,
                    query: q,
                    key: new_tab_key(),
                    new_searcher: new_searcher,
                };
                q.subscribe(async (q) => {
                    if (tab.new_searcher) {
                        tab.searcher.set(await tab.new_searcher(q));
                    }
                });
                t = [tab];
                return t;
            });
            curr_tab_index.set(0);
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
            tabs.update(t => {
                let tab: Tab = {
                    name: "Related",
                    searcher: writable(s),
                    thumbnail: null,
                    query: writable(""),
                    key: new_tab_key(),
                    new_searcher: null,
                };
                t = [tab];
                return t;
            });
            curr_tab_index.set(0);
        } break;
        case "home-feed": {
            // let st = await import("$lib/searcher/song_tube.ts");
            // let s = st.SongTube.new({
            //     type: "HomeFeed",
            // });
            // tabs.update(t => {
            //     t = [{
            //         name: "Home",
            //         searcher: writable(s),
            //         new_searcher: null,
            //         key: new_tab_key(),
            //         thumbnail: null,
            //         query: writable(""),
            //     }];
            //     return t;
            // });
            // curr_tab_index.set(0);
        } break;
        default:
            throw exhausted(option);
    }
});
