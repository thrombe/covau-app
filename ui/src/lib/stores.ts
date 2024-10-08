import { type Writable, writable, derived, get, type Readable } from "svelte/store";
import { CustomListItem, type ListItem, type Option } from "$lib/searcher/item.ts";
import * as db from "$lib/searcher/db.ts";
import { Innertube } from "youtubei.js/web";
import * as st from "$lib/searcher/song_tube.ts";
import * as mbz from "$lib/searcher/mbz.ts";
import { exhausted } from "$lib/utils.ts";
import { toast } from "./toast/toast";
import type { AutoplayQueryInfo, LocalSyncQueue } from "./local/queue.ts";
import { type Searcher, fused_searcher, type NewSearcher } from "./searcher/searcher.ts";
import { OptionsWrapper } from "./searcher/mixins.ts";
import * as icons from "$lib/icons.ts";
import * as types from "$types/types.ts";
import { tick } from "svelte";
import * as utils from "$lib/utils.ts";
import { prompter } from "./prompt/prompt.ts";
import * as rc from "$lib/rc.ts";
import { imports } from "$lib/cyclic.ts";

export type DetailTab = {
    type: "detail",
    item: Writable<ListItem>,
    updater: Writable<number>,
    key: number;
    name: string;
};
export type BrowseTab = {
    type: "browse",
    key: number;
    name: string;
    searcher: Writable<Searcher>;
    updater: Writable<number>,
    new_searcher: NewSearcher | null;
    query: Writable<string>;
    options: Readable<Option[]>;
};
export type Tab = DetailTab | BrowseTab;

export type MenubarOption = { name: string, key: number } & (
    | { content_type: "db", type: types.db.Typ }
    | { content_type: "list", type: types.yt.Typ | "YtVideo" | "YtChannel" | mbz.SearchTyp | "covau-group" }
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
    async drop() {
        let ds = get(drag_source);
        if (ds) {
            await utils.wrap_toast(ds.drop_callback)();
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
    | ({ source: "Youtube" } & st.BrowseQuery)
    | ({ source: "Musimanager" } & db.BrowseQuery)
    | ({ source: "Musicbrainz" } & mbz.BrowseQuery)
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
            updater: writable(1),
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
            updater: writable(1),
            new_searcher: new_searcher,
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

export let update_current_tab = () => {
    let tab = get(curr_tab);
    if (!tab) {
        return;
    }
    tab.updater.update(t => t + 1);
};
export let curr_tab = derived(
    [tabs, curr_tab_index],
    ([$tabs, $index]) => $tabs[$index],
);

export type MessageHandler = ((msg: types.server.PlayerMessage) => Promise<void>) | ((msg: types.server.PlayerMessage) => void);
export interface Player {
    play_item(item: ListItem): (Promise<void> | void);
    pause(): void;
    unpause(): void;
    on_message(handler: MessageHandler): void;
    destroy(): Promise<void>;
    set_volume(v: number): void;
    seek_to_perc(t: number): (Promise<void> | void);
    seek_by(t: number): (Promise<void> | void);
    toggle_pause(): void;
    toggle_mute(): void;
    is_playing(): boolean;
    is_finished(): boolean;
    get_progress(): number;
}
export let dummy_player: Player = {
    play_item() { },
    pause() { },
    unpause() { },
    on_message() { },
    async destroy() { },
    set_volume() { },
    seek_to_perc() { },
    seek_by() { },
    toggle_pause() { },
    toggle_mute() { },
    is_playing() { return false; },
    is_finished() { return false; },
    get_progress() { return 0; },
};

export let playing_item: Writable<ListItem> = writable(new CustomListItem(
    "default",
    "Nothing is playing",
    "Nothing"
));
// TODO: also allow sync/player
export let player: Writable<Player> = writable(dummy_player);
export type PlayerType = "YtPlayer" | "YtVideoPlayer" | "AudioPlayer" | "MusiPlayer" | "None";
export let player_type: Writable<PlayerType> = writable("None");
export let set_player = async (p: Player, progress: number, is_playing: boolean) => {
    await get(player).destroy();
    player.set(p);

    let item = get(playing_item);
    if (item.typ() == "Nothing") {
        return;
    }
    await p.play_item(item);
    await p.seek_to_perc(progress);
    if (!is_playing) {
        p.pause();
    }
};
export let set_player_type = async (t: PlayerType) => {
    let pl = get(player);
    let is_playing = pl.is_playing();
    let progress = pl.get_progress();
    switch (t) {
        case "MusiPlayer": {
            await pl.destroy();
            player.set(dummy_player);
            player_type.set("MusiPlayer");

            let p = await imports.local.player.Musiplayer.new();

            await tick();
            await set_player(p, progress, is_playing);
        } break;
        case "YtPlayer": {
            await pl.destroy();
            player.set(dummy_player);
            player_type.set("YtPlayer");

            let _stat = await imports.player.yt.init_api();

            await tick();
            // NOTE: assuming that a div with 'video' id exsits
            let p = await imports.player.yt.YtPlayer.new("video");
            await set_player(p, progress, is_playing);
        } break;
        case "YtVideoPlayer": {
            await pl.destroy();
            player.set(dummy_player);
            player_type.set("YtVideoPlayer");

            let _stat = await imports.player.yt.init_api();

            await tick();
            // NOTE: assuming that a div with 'video' id exsits
            let p = await imports.player.yt.YtPlayer.new("video");
            await set_player(p, progress, is_playing);
        } break;
        case "AudioPlayer": {
            await pl.destroy();
            player.set(dummy_player);
            player_type.set("AudioPlayer");

            await tick();
            // NOTE: assuming that a div with 'audio' id exsits
            let p = await imports.player.audio.Audioplayer.new("audio");
            await set_player(p, progress, is_playing);
        } break;
        case "None": {
            await pl.destroy();
            player.set(dummy_player);
        } break;
        default:
            throw exhausted(t);
    }
};

export let queue: Writable<LocalSyncQueue> = writable();

type Syncer = {
    state: rc.DbRc<types.covau.LocalState>,
    queue: rc.DbRc<types.covau.Queue>,
    blacklist: rc.DbRc<types.covau.ArtistBlacklist> | null,
    seen: rc.DbRc<types.covau.SongBlacklist> | null,
    seed: rc.DbRc<types.covau.Song> | null,
};
export let syncer: Writable<Syncer> = writable();
export const syncops = {
    // load everything from db into _
    async load() {
        let q = new imports.local.queue.LocalSyncQueue();

        let state = await imports.server.db.get_by_id("LocalState", 1);
        if (state == null) {
            throw new Error("Database does not have state object");
        }
        let sync: Syncer = {
            state: rc.rc.store.rc(state),
            // @ts-ignore
            queue: null,
            blacklist: null,
            seed: null,
            seen: null,
        };

        if (sync.state.t.t.queue != null) {
            let dbq = (await imports.server.db.get_by_id("Queue", sync.state.t.t.queue))!;
            sync.queue = rc.rc.store.rc(dbq);
            let items = await imports.server.db.get_many_by_id("Song", dbq.t.queue.queue.songs);
            q.items = db.db.wrapped_items(items);
            q.playing_index = dbq.t.queue.current_index;
            if (q.playing_index != null) {
                q.state = "Playing";
                playing_item.set(q.items[q.playing_index]);
            }

            if (sync.queue.t.t.blacklist != null) {
                let bl = (await imports.server.db.get_by_id("ArtistBlacklist", sync.queue.t.t.blacklist))!;
                sync.blacklist = rc.rc.store.rc(bl);
                q.blacklist_artist_ids = [...bl.t.artists];
                q.bl_artist_ids = new Set(bl.t.artists.map(id => id.content));
            }
            if (sync.queue.t.t.seen != null) {
                let bl = (await imports.server.db.get_by_id("SongBlacklist", sync.queue.t.t.seen))!;
                sync.seen = rc.rc.store.rc(bl);
                q.blacklist_ids = [...bl.t.songs];
                q.bl_ids = new Set(bl.t.songs.map(id => id.content));
            }
            if (sync.queue.t.t.seed != null) {
                let s = (await imports.server.db.get_by_id("Song", sync.queue.t.t.seed))!;
                let w = db.db.wrapped(s);
                sync.seed = rc.rc.store.rc(s);
                q.set_seed(w);
            }
        }

        syncer.set(sync);
        queue.set(q);

        if (sync.state.t.t.queue == null) {
            await syncops.new.queue("Queue");
        }

        await syncops.listeners.reset.queue();
        await syncops.listeners.reset.blacklist();
        await syncops.listeners.reset.seen();
    },

    listeners: {
        disable: {
            queue: () => { },
            blacklist: () => { },
            seen: () => { },
        },
        reset: {
            async queue() {
                let sync = get(syncer);
                let q = get(queue);

                syncops.listeners.disable.queue();
                syncops.listeners.disable.queue = imports.server.db.set_update_listener<types.covau.Queue>(
                    sync.queue.id,
                    async (item) => {
                        if (sync.queue.t.metadata.update_counter >= item.metadata.update_counter) {
                            return;
                        }

                        // sync.queue = rc.rc.store.rc(item);
                        let items = await imports.server.db.get_many_by_id("Song", item.t.queue.queue.songs);
                        q.items = db.db.wrapped_items(items);
                        q.playing_index = item.t.queue.current_index;
                        if (q.playing_index != null) {
                            let item = q.items[q.playing_index];
                            await q.sync_play(item);
                        }
                        queue.update(t => t);
                    }
                );
            },
            async blacklist() {
                let sync = get(syncer);
                let q = get(queue);

                syncops.listeners.disable.blacklist();
                if (sync.blacklist == null) {
                    syncops.listeners.disable.blacklist = () => { };
                    return;
                }
                syncops.listeners.disable.blacklist = imports.server.db.set_update_listener<types.covau.ArtistBlacklist>(
                    sync.blacklist.id,
                    async (bl) => {
                        if ((sync.blacklist?.t.metadata?.update_counter ?? 0) >= bl.metadata.update_counter) {
                            return;
                        }

                        // sync.blacklist = rc.rc.store.rc(bl);
                        q.blacklist_artist_ids = [...bl.t.artists];
                        q.bl_artist_ids = new Set(bl.t.artists.map(id => id.content));
                        queue.update(t => t);
                    }
                );
            },
            async seen() {
                let sync = get(syncer);
                let q = get(queue);

                syncops.listeners.disable.seen();
                if (sync.seen == null) {
                    syncops.listeners.disable.seen = () => { };
                    return;
                }
                syncops.listeners.disable.seen = imports.server.db.set_update_listener<types.covau.SongBlacklist>(
                    sync.seen.id,
                    async (bl) => {
                        if ((sync.seen?.t.metadata?.update_counter ?? 0) >= bl.metadata.update_counter) {
                            return;
                        }

                        // sync.seen = rc.rc.store.rc(bl);
                        q.blacklist_ids = [...bl.t.songs];
                        q.bl_ids = new Set(bl.t.songs.map(id => id.content));
                        queue.update(t => t);
                    }
                );
            },
        },
    },

    // push state to db
    // save: {
    //     debounced: {
    //         _timeouts: {
    //             queue: 0,
    //             blacklist: 0,
    //             seen: 0,
    //             sync: 0,
    //         },
    //         queue() {
    //             clearTimeout(syncops.save.debounced._timeouts.queue);
    //             syncops.save.debounced._timeouts.queue = setTimeout(syncops.save.queue, 300) as unknown as number;
    //         },
    //         blacklist() {
    //             clearTimeout(syncops.save.debounced._timeouts.blacklist);
    //             syncops.save.debounced._timeouts.blacklist = setTimeout(syncops.save.blacklist, 300) as unknown as number;
    //         },
    //         seen() {
    //             clearTimeout(syncops.save.debounced._timeouts.seen);
    //             syncops.save.debounced._timeouts.seen = setTimeout(syncops.save.seen, 300) as unknown as number;
    //         },
    //         sync() {
    //             clearTimeout(syncops.save.debounced._timeouts.sync);
    //             syncops.save.debounced._timeouts.sync = setTimeout(syncops.save.sync, 300) as unknown as number;
    //         },
    //     },
    //     async queue() {
    //         let server = await import("$lib/server.ts");
    //         let sync = get(syncer);

    //         sync.queue = await server.db.txn(async db => {
    //             return await db.update(sync.queue);
    //         });

    //         syncer.update(t => t);
    //     },
    //     async blacklist() {
    //         let server = await import("$lib/server.ts");
    //         let sync = get(syncer);

    //         sync.blacklist = await server.db.txn(async db => {
    //             return await db.update(sync.blacklist!);
    //         });

    //         syncer.update(t => t);
    //     },
    //     async seen() {
    //         let server = await import("$lib/server.ts");
    //         let sync = get(syncer);

    //         sync.seen = await server.db.txn(async db => {
    //             return await db.update(sync.seen!);
    //         });

    //         syncer.update(t => t);
    //     },
    //     async sync() {
    //         let server = await import("$lib/server.ts");
    //         let sync = get(syncer);

    //         sync.state = await server.db.txn(async db => {
    //             return await db.update(sync.state);
    //         });

    //         syncer.update(t => t);
    //     },
    // },
    set: {
        async queue(q_: rc.DbRc<types.covau.Queue>) {
            let sync = get(syncer);
            let q = get(queue);
            q.reset();

            await sync.state.txn(async state => {
                state.t.queue = q_.t.id;
                return state;
            });
            sync.queue = q_;
            sync.seed = null;
            sync.blacklist = null;
            sync.seen = null;

            await syncops.listeners.reset.queue();

            if (sync.state.t.t.queue != null) {
                let items = await imports.server.db.get_many_by_id("Song", utils.clone(sync.queue.t.t.queue.queue.songs));
                q.items = db.db.wrapped_items(items);
                q.playing_index = sync.queue.t.t.queue.current_index;
                if (q.playing_index != null) {
                    let item = q.items[q.playing_index];
                    if (item.get_key() != get(playing_item).get_key()) {
                        q.play_queue_item(item);
                    }
                }

                if (sync.queue.t.t.blacklist != null) {
                    let bl = (await imports.server.db.get_by_id("ArtistBlacklist", sync.queue.t.t.blacklist))!;
                    sync.blacklist = rc.rc.store.rc(bl);
                    await syncops.listeners.reset.blacklist();
                    q.blacklist_artist_ids = [...bl.t.artists];
                    q.bl_artist_ids = new Set(bl.t.artists.map(id => id.content));
                }
                if (sync.queue.t.t.seen != null) {
                    let bl = (await imports.server.db.get_by_id("SongBlacklist", sync.queue.t.t.seen))!;
                    sync.seen = rc.rc.store.rc(bl);
                    await syncops.listeners.reset.seen();
                    q.blacklist_ids = [...bl.t.songs];
                    q.bl_ids = new Set(bl.t.songs.map(id => id.content));
                }
                if (sync.queue.t.t.seed != null) {
                    let s = (await imports.server.db.get_by_id("Song", sync.queue.t.t.seed))!;
                    let w = db.db.wrapped(s);
                    sync.seed = rc.rc.store.rc(s);
                    q.set_seed(w);
                }
            }

            syncer.update(t => t);
            queue.update(t => t);
        },
        async blacklist(bl: types.db.DbItem<types.covau.ArtistBlacklist>) {
            let sync = get(syncer);
            let q = get(queue);

            sync.blacklist = rc.rc.store.rc(bl);
            await sync.queue.txn(async q => {
                q.t.blacklist = bl.id;
                return q;
            });
            q.blacklist_artist_ids = [...bl.t.artists];
            q.bl_artist_ids = new Set(bl.t.artists.map(id => id.content));

            syncer.update(t => t);
            queue.update(t => t);
        },
        async seen(bl: types.db.DbItem<types.covau.SongBlacklist>) {
            let sync = get(syncer);
            let q = get(queue);

            sync.seen = rc.rc.store.rc(bl);
            await sync.queue.txn(async q => {
                q.t.seen = bl.id;
                return q;
            });
            q.blacklist_ids = [...bl.t.songs];
            q.bl_ids = new Set(bl.t.songs.map(id => id.content));

            syncer.update(t => t);
            queue.update(t => t);
        },
    },
    new: {
        async queue(title: string | null = null) {
            let name: string;
            if (title == null) {
                let _name = await prompter.prompt("Enter name");
                if (_name == null) {
                    return;
                }
                name = _name;
            } else {
                name = title;
            }

            let q = get(queue);
            let sync = get(syncer);

            await imports.server.db.txn(async db => {
                let dbq = await db.insert<types.covau.Queue>({
                    typ: "Queue",
                    t: {
                        queue: {
                            queue: {
                                title: name,
                                songs: [],
                            },
                            current_index: null,
                        },
                        blacklist: null,
                        seen: null,
                        seed: null,
                    },
                });
                await sync.state.txn(async state => {
                    state.t.queue = dbq.id;
                    return state;
                }, db);
                sync.queue = rc.rc.store.rc(dbq);
                sync.blacklist = null;
                sync.seen = null;
                sync.seed = null;
            });
            await syncops.listeners.reset.queue();
            q.reset();

            syncer.update(t => t);
            queue.update(t => t);
        },
        async blacklist() {
            let q = get(queue);
            let sync = get(syncer);

            let bl = await imports.server.db.txn(async db => {
                let bl = await db.insert<types.covau.ArtistBlacklist>({
                    typ: "ArtistBlacklist",
                    t: {
                        title: null,
                        artists: [],
                    },
                });
                await sync.queue.txn(async q => {
                    q.t.blacklist = bl.id;
                    return q;
                }, db);
                sync.blacklist = rc.rc.store.rc(bl);
                return bl;
            });
            q.blacklist_artist_ids = [...bl.t.artists];
            q.bl_artist_ids = new Set(bl.t.artists.map(id => id.content));
            await syncops.listeners.reset.blacklist();

            syncer.update(t => t);
            queue.update(t => t);
        },
        async seen() {
            let q = get(queue);
            let sync = get(syncer);

            let bl = await imports.server.db.txn(async db => {
                let bl = await db.insert<types.covau.SongBlacklist>({
                    typ: "SongBlacklist",
                    t: {
                        title: null,
                        songs: [],
                    },
                });
                await sync.queue.txn(async q => {
                    q.t.seen = bl.id;
                    return q;
                }, db);
                sync.seen = rc.rc.store.rc(bl);
                return bl;
            });
            q.blacklist_ids = [...bl.t.songs];
            q.bl_ids = new Set(bl.t.songs.map(id => id.content));
            await syncops.listeners.reset.seen();

            syncer.update(t => t);
            queue.update(t => t);
        },
    },
};

export const queue_ops = {
    async play_next() {
        await get(queue).play_next();
        queue.update(q => q);
    },

    async detour(item: ListItem) {
        await get(queue).play_item(item);
        get(queue).detour();
        queue.update(q => q);
    },

    async add_item(...items: ListItem[]) {
        await get(queue).add(...items);
        queue.update(q => q);
        if (items.length > 1) {
            toast("all items added to queue");
        } else if (items.length == 1) {
            toast("item added to queue");
        }
    },

    async remove_item(item: ListItem) {
        let index = await get(queue).remove(item);
        if (index == null) {
            toast(`item "${item.title()}" not in queue`, "error");
        }
        queue.update(q => q);
    },

    get_current_item() {
        let q = get(queue);
        if (q.playing_index == null) {
            toast("nothing is playing", "error");
            throw new Error("nothing is playing");
        }
        let item = q.items[q.playing_index];
        return item;
    },

    async play_item(item: ListItem) {
        await get(queue).play_queue_item(item);
        queue.update(q => q);
    },

    async blacklist_artists(item: ListItem) {
        let r = await get(queue).add_artists_to_blacklist(item);
        if (!r) {
            return false;
        }
        queue.update(q => q);
        return true;
    },

    async unblacklist_artists(item: ListItem) {
        await get(queue).remove_artists_from_blacklist(item);
        queue.update(q => q);
    },

    async repeat_song() {
        let q = get(queue);
        if (q.state == "Detour") {
            toast("item is already set to repeat once", "error");
        } else {
            q.detour();
            queue.update(q => q);
            toast("current song will repeat after it finishes");
        }
    },
};


selected_menubar_option.subscribe(async (option) => {
    if (!get(tube)) {
        return;
    }
    let s: Searcher = fused_searcher;
    let new_searcher: ((q: string) => Promise<Searcher>) | ((q: string) => Searcher) | null = null;
    switch (option.content_type) {
        case "db": {
            switch (option.type) {
                case "MmSong":
                case "MmAlbum":
                case "MmArtist":
                case "MmPlaylist":
                case "MmQueue":
                case "Song":
                case "Playlist":
                case "Queue":
                case "ArtistBlacklist":
                case "SongBlacklist":
                case "MbzRecording":
                case "MbzArtist":
                case "LocalState":
                case "Updater":
                case "StSong":
                case "StAlbum":
                case "StPlaylist":
                case "StArtist": {
                    let type = option.type;
                    new_searcher = (q: string) => db.Db.new({
                        query_type: "search",
                        type: type,
                        query: q,
                    }, 50);
                    s = new_searcher(get(query_input));
                } break;
                default:
                    throw exhausted(option);
            }
            new_tab(
                s,
                "Results",
                get(query_input),
                new_searcher,
                false,
            );
        } break;
        case "list": {
            switch (option.type) {
                case "YtSong":
                case "YtAlbum":
                case "YtPlaylist":
                case "YtArtist": {
                    let type = option.type;
                    new_searcher = (q: string) => st.SongTube.new({
                        type: "Search",
                        content: {
                            query: q,
                            search: type,
                        },
                    });
                    s = new_searcher(get(query_input));
                } break;
                case "YtChannel": {
                    new_searcher = (q: string) => st.SongTube.new({
                        type: "ChannelSearch",
                        content: {
                            query: q,
                        },
                    });
                    s = new_searcher(get(query_input));
                } break;
                case "YtVideo": {
                    new_searcher = (q: string) => st.SongTube.new({
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
                    new_searcher = (q: string) => mbz.Mbz.new({
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
                                onclick: async () => {
                                    let items = await s.next_page();
                                    await queue_ops.add_item(...items);
                                },
                            });
                            return old;
                        });
                        let s = st.SongTube.new({
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
                    throw exhausted(option);
            }
            new_tab(
                s,
                "Results",
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
                s = await imports.local.queue.autoplay_searcher(query);
            } else {
                toast("could not find related for " + item.title(), "error");
            }
            new_tab(
                s,
                "Related",
                null,
                null,
                false,
            );
        } break;
        case "home-feed": {
            let s = st.SongTube.new({
                type: "HomeFeed",
            });
            new_tab(
                s,
                "Home",
                null,
                null,
                false,
            );
        } break;
        default:
            throw exhausted(option);
    }
});
