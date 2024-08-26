import { player, playing_item, queue } from "$lib/stores.ts";
import type { ListItem, Option } from "$lib/searcher/item.ts";
import { toast } from "$lib/toast/toast.ts";
import { prompter } from "$lib/prompt/prompt.ts";
import { StaticSearcher, type Searcher } from "$lib/searcher/searcher.ts";
import * as icons from "$lib/icons.ts";
import * as server from "$lib/server.ts";
import * as stores from "$lib/stores.ts";
import * as types from "$types/types.ts";

import { exhausted } from "$lib/utils.ts";
import { SongTube } from "$lib/searcher/song_tube.ts";
import * as mbz from "$lib/searcher/mbz.ts";
import { get } from "svelte/store";
import * as db from "$lib/searcher/db.ts";


export class QueueManager implements Searcher {
    items: ListItem[] = [];
    playing_index: number | null = null;

    state: "Unstarted" | "Playing" | "Detour" | "Finished" = "Unstarted";

    has_next_page: boolean = true;
    async next_page(): Promise<ListItem[]> {
        this.has_next_page = false;
        return this.items;
    }

    reset() {
        this.items = [];
        this.playing_index = null;
        let is_playing = get(player).is_playing();
        if (is_playing) {
            this.detour();
        } else {
            this.state = "Unstarted";
        }
        this.has_next_page = true;
    }

    detour() {
        this.state = "Detour";
    }
    finished() {
        if (this.state !== "Finished") {
            this.state = "Finished";
            get(player).pause();
            player.update(p => p);
        }
    }
    get_item_index(item: ListItem) {
        for (let i = 0; i < this.items.length; i++) {
            if (this.items[i].get_key() == item.get_key()) {
                return i;
            }
        }
        return null;
    }
    async play_queue_item(item: ListItem) {
        this.playing_index = this.get_item_index(item);
        if (this.playing_index != null) {
            await this.play(this.playing_index);
        } else {
            toast(`item "${item.title()}" not in queue`, "error");
        }
    }
    async remove(item: ListItem) {
        let index = this.get_item_index(item);
        if (index != null) {
            await this.remove_at(index);
            return index;
        } else {
            return null;
        }
    }
    async move_queue_item(item: ListItem, to: number) {
        let index = this.get_item_index(item);
        if (index != null) {
            await this.move(index, to);
        } else {
            throw new Error(`item "${item.title()}" not in queue`);
        }
    }
    async add(...items: ListItem[]) {
        for (let item of items) {
            if (this.items.find((a) => a.get_key() == item.get_key())) {
                toast(`item "${item.title()}" already in queue`, "error");
            } else {
                this.items.push(item);
            }
        }

        if (this.state == "Unstarted") {
            await this.play_next();
        }

        if (this.state == "Finished") {
            await this.play_next();
        }
    }
    async move(from: number, to: number) {
        if (this.playing_index != null) {
            if (from == this.playing_index) {
                this.playing_index = Math.min(to, this.items.length - 1);
            } else if (
                this.playing_index >= Math.min(from, to) &&
                this.playing_index <= Math.max(from, to)
            ) {
                this.playing_index += 1 * Math.sign(from - to);
            }
        }

        if (from < to) {
            this.items.splice(to + 1, 0, this.items[from]);
            this.items.splice(from, 1);
        } else {
            this.items.splice(to, 0, this.items[from]);
            this.items.splice(from + 1, 1);
        }
    }
    async insert(index: number, item: ListItem) {
        if (this.get_item_index(item) != null) {
            toast(`item "${item.title()}" already in queue`, "error");
            return;
        }
        if (this.playing_index != null) {
            if (this.playing_index >= index) {
                this.playing_index += 1;
            }
        }
        this.items.splice(index, 0, item);

        if (this.state == "Finished") {
            this.playing_index = this.items.length - 1;
            await this.play(this.playing_index);
        }
    }
    async remove_at(index: number) {
        if (this.playing_index != null) {
            if (this.playing_index > index) {
                this.playing_index -= 1;
                this.items.splice(index, 1);
            } else if (this.playing_index == index) {
                if (this.items.length <= 1) {
                    // queue will have no items after removing
                    this.items = [];
                    this.playing_index = null;
                    this.detour();
                    return;
                } else if (index == this.items.length - 1) {
                    // queue.length > 1
                    this.playing_index -= 1;
                    this.items.splice(index, 1);
                    if (this.state == "Playing") {
                        await this.play(this.playing_index);
                    }
                } else {
                    this.playing_index -= 1;
                    this.items.splice(index, 1);
                    if (this.state == "Playing") {
                        await this.play_next();
                    }
                }
            } else {
                // if removed item comes after the currently playing one
                this.items.splice(index, 1);
            }
        } else {
            this.items.splice(index, 1);
        }
    }
    async play_prev() {
        if (this.state == "Detour") {
            if (this.playing_index != null) {
                await this.play(this.playing_index);
            }
            return;
        }

        if (this.playing_index != null) {
            this.playing_index -= 1;
            if (this.playing_index >= 0) {
                await this.play(this.playing_index);
            } else {
                this.playing_index = 0;
            }
        }
    }
    protected async play_next_if_detour() {
        if (this.state == "Detour") {
            if (this.playing_index == null && this.items.length > 0) {
                this.playing_index = 0;
            }
            if (this.playing_index != null) {
                await this.play(this.playing_index);
            }
            return true;
        }
        return false;
    }
    async play_next() {
        if (await this.play_next_if_detour()) {
            return;
        }

        if (this.playing_index != null) {
            this.playing_index += 1;
            if (this.items.length > this.playing_index) {
                await this.play(this.playing_index);
            } else {
                this.playing_index -= 1;
            }
        } else {
            this.playing_index = 0;
            await this.play(this.playing_index);
        }
    }
    async has_prev() {
        if (this.playing_index != null) {
            return this.playing_index > 0;
        } else {
            return false;
        }
    }
    async has_next() {
        if (this.playing_index != null) {
            return this.items.length > this.playing_index + 1;
        } else {
            return this.items.length > 0;
        }
    }
    async play(index: number) {
        let item = this.items.at(index);
        if (item) {
            this.state = "Playing";
            await this.play_item(item);
        } else {
            toast(`no item at index ${index}`, "error");
        }
    }
    async play_item(item: ListItem) {
        try {
            let p = get(player);
            await p.play_item(item);
            playing_item.set(item);
            player.update(p => p);
        } catch (e: any) {
            if (e instanceof Error) {
                toast(e.message, "error");
            } else {
                toast(e, "error");
            }
        }
    }

    // must not call the db
    async sync_play(item: ListItem) {
        let curr = get(stores.playing_item);
        if (item.get_key() == curr.get_key()) {
            return;
        }
        let p = get(stores.player);
        let play = p.is_playing() || p.is_finished();

        await p.play_item(item);
        stores.playing_item.set(item);

        if (!play) {
            p.pause();
        }

        this.state = "Playing";
    }

    async handle_drop(item: ListItem, target: number | null, is_outsider: boolean): Promise<boolean> {
        if (!item.is_playable()) {
            return false;
        }
        if (is_outsider) {
            if (target == null || target > this.items.length) {
                target = this.items.length;
            }
            await this.insert(target, item);
        } else {
            if (target == null || target > this.items.length) {
                target = this.items.length - 1;
            }
            await this.move_queue_item(item, target);
        }
        return true;
    }

    options(): Option[] {
        return [
            {
                title: "empty queue",
                icon: icons.remove,
                onclick: () => {
                    let q = get(queue) as AutoplayQueueManager;
                    let state = q.state;
                    q.reset();
                    if (state == "Playing") {
                        q.detour();
                    }
                    queue.update(q => q);
                    toast("queue emptied");
                },
            },
            {
                title: "new queue",
                icon: icons.repeat,
                onclick: async () => {
                    await stores.syncops.new.queue();
                    toast("new queue set");
                },
            },
            {
                title: "new song blacklist",
                icon: icons.repeat,
                onclick: async () => {
                    await stores.syncops.new.seen();
                    toast("new song blacklist set");
                },
            },
            {
                title: "new artist blacklist",
                icon: icons.repeat,
                onclick: async () => {
                    await stores.syncops.new.blacklist();
                    toast("new artist blacklist set");
                },
            },
            {
                title: "reseed autoplay",
                icon: icons.repeat,
                onclick: async () => {
                    let q = get(queue) as AutoplayQueueManager;
                    let item = q.items.at(q.playing_index ?? (q.items.length - 1)) ?? null;
                    if (!item) {
                        toast("no item in queue. can't pick autoplay seed", "error");
                        return;
                    }

                    await q.init_with_seed(item);
                    toast("new seed set");
                },
            },
            {
                title: "repeat song",
                icon: icons.repeat,
                onclick: async () => {
                    stores.queue_ops.repeat_song();
                },
            },
            {
                title: "open details",
                icon: icons.open_new_tab,
                onclick: async () => {
                    let sync = get(stores.syncer);
                    let item = db.db.wrapped(sync.queue.t);
                    await item.common_options().open_details.onclick();
                },
            },
            {
                title: "Explore autoplay items",
                icon: icons.open_new_tab,
                onclick: async () => {
                    let stores = await import("$lib/stores.ts");
                    let q = get(queue) as AutoplayQueueManager;
                    let s = StaticSearcher(q.autoplay_items() ?? []);
                    stores.new_tab(s, "Autoplay items");
                },
            },
            {
                title: "searcher prompt test",
                icon: icons.covau_icon,
                onclick: async () => {
                    let new_searcher = (q: string) => db.Db.new({
                        type: "MmSong",
                        query_type: "search",
                        query: q,
                    }, 50);
                    let q = "milet";
                    let s = new_searcher(q);
                    let item = await prompter.searcher_prompt(
                        s,
                        false,
                        "Do Da Do",
                        q,
                        new_searcher,
                    );
                    console.log(item);
                },
            },
        ];
    }
};

export type AutoplayQueryInfo = {
    type: "StSearchRelated",
    title: string,
    artists: string[],
} | {
    type: "StRelated",
    id: string,
} | {
    type: "MbzRadio",
    title: string | null,
    artists: string[], // name (or id) straight from mbz
};
export type AutoplayTyp = "StSearchRelated" | "StRelated" | "MbzRadio";

export async function autoplay_searcher(q: AutoplayQueryInfo): Promise<Searcher> {
    switch (q.type) {
        case "StSearchRelated": {
            let query: string;
            if (q.artists.length > 0) {
                query = `${q.title} by ${q.artists.reduce((a, b) => a + ", " + b)}`;
            } else {
                query = q.title;
            }
            let songs = await SongTube.new({
                type: "Search",
                content: {
                    query: query,
                    search: "YtSong",
                },
            }).next_page();
            return SongTube.new({
                type: "UpNext",
                content: songs[0].data.content.id,
            });
        } break;
        case "StRelated": {
            return SongTube.new({
                type: "UpNext",
                content: q.id,
            });
        } break;
        case "MbzRadio": {
            let query = q.artists.reduce((a, b) => a + ", " + b);
            return mbz.Mbz.new({
                query_type: "search",
                type: "MbzRadioSong",
                query: query
            }, 30);
        } break;
        default:
            throw exhausted(q);
    }
}

export async function autoplay_try_all(item: ListItem) {
    let r1 = await item.autoplay_query("StRelated");
    if (r1) {
        return r1;
    }
    let r2 = await item.autoplay_query("StSearchRelated");
    if (r2) {
        return r2;
    }
    let r3 = await item.autoplay_query("MbzRadio");
    if (r3) {
        return r3;
    }
    return null;
}

type AutoplayInfo = {
    searcher: Searcher;
    seed_item: ListItem;
    items: ListItem[];
    index: number; // index is always valid
};
type AutoplayState = {
    state: 'Uninit';
} | {
    state: 'Disabled';
    info: AutoplayInfo | null,
} | {
    state: 'DisabledWithSeed';
    seed: ListItem,
} | ({
    state: 'Init';
} & AutoplayInfo) | {
    state: "Finished";
    items: ListItem[];
};

export class AutoplayQueueManager extends QueueManager {
    autoplay_state: AutoplayState = { state: "Disabled", info: null };
    blacklist_ids: types.covau.InfoSource[] | null = null;
    bl_ids: Set<string> = new Set();
    blacklist_artist_ids: types.covau.InfoSource[] | null = null;
    bl_artist_ids: Set<string> = new Set();

    async autoplay_toggle() {
        if (this.autoplay_state.state === "Disabled" || this.autoplay_state.state === "DisabledWithSeed") {
            await this.autoplay_enable();
        } else {
            this.autoplay_disable();
        }
    }

    autoplay_disable() {
        if (this.autoplay_state.state == "Init") {
            this.autoplay_state = { state: "Disabled", info: this.autoplay_state };
        } else if (this.autoplay_state.state == "Disabled") {
            // pass
        } else if (this.autoplay_state.state == "DisabledWithSeed") {
            // pass
        } else {
            this.autoplay_state = { state: "Disabled", info: null };
        }
    }

    get_seed() {
        if (this.autoplay_state.state == "Init") {
            return this.autoplay_state.seed_item;
        } else if (this.autoplay_state.state == "Disabled") {
            return this.autoplay_state.info?.seed_item ?? null;
        } else if (this.autoplay_state.state == "DisabledWithSeed") {
            return this.autoplay_state.seed;
        } else {
            return null;
        }
    }

    async autoplay_enable() {
        if (this.autoplay_state.state === "DisabledWithSeed") {
            await this.init_with_seed(this.autoplay_state.seed);
        } else if (this.autoplay_state.state === "Disabled") {
            if (this.autoplay_state.info == null) {
                this.autoplay_state = { state: "Uninit" };
                if (this.playing_index != null) {
                    await this.init_with_seed(this.items[this.playing_index]);
                }
            } else {
                this.autoplay_state = {
                    ...this.autoplay_state.info,
                    state: "Init",
                };
            }
        }
        if (this.state == "Finished") {
            await this.play_next();
        }
    }

    autoplay_is_enabled() {
        return this.autoplay_state.state !== "Disabled" && this.autoplay_state.state !== "DisabledWithSeed";
    }

    reset() {
        super.reset();
        this.autoplay_state = { state: "Disabled", info: null };
        this.blacklist_ids = null;
        this.blacklist_artist_ids = null;
        this.bl_ids = new Set();
        this.bl_artist_ids = new Set();
    }

    set_seed(item: ListItem) {
        this.autoplay_state = {
            state: "DisabledWithSeed",
            seed: item,
        };
    }

    async init_with_seed(item: ListItem) {
        let query = await autoplay_try_all(item);
        if (!query) {
            return false;
        }
        let searcher = await autoplay_searcher(query);
        if (!searcher) {
            return false;
        }
        let items = await searcher.next_page();
        if (items.length == 0) {
            return false;
        }

        await this.add_to_blacklist(item);

        this.autoplay_state = {
            state: "Init",
            searcher,
            seed_item: item,
            items,
            index: 0,
        };

        await this.skip_dups();

        if (this.state == "Unstarted" || this.state == "Finished") {
            await this.play_next();
        }

        return true;
    }

    async add_to_blacklist(item: ListItem) {
        if (!this.blacklist_ids) {
            return;
        }
        let ids = item.song_ids();
        for (let id of ids) {
            if (!this.bl_ids.has(id.content)) {
                this.blacklist_ids.push(id);
                this.bl_ids.add(id.content);
            }
        }
    }

    async add_artists_to_blacklist(item: ListItem) {
        let ids = item.artist_ids();
        for (let id of ids) {
            await this.add_artist_to_blacklist(id);
        }
    }

    async remove_artists_from_blacklist(item: ListItem) {
        let ids = item.artist_ids();
        for (let id of ids) {
            await this.remove_artist_from_blacklist(id);
        }
    }

    protected async add_artist_to_blacklist(id: types.covau.InfoSource) {
        if (!this.blacklist_artist_ids) {
            return;
        }
        if (!this.bl_artist_ids.has(id.content)) {
            this.blacklist_artist_ids.push(id);
            this.bl_artist_ids.add(id.content);
        }
    }

    protected async remove_artist_from_blacklist(id: types.covau.InfoSource) {
        if (!this.blacklist_artist_ids) {
            return;
        }
        if (this.bl_artist_ids.has(id.content)) {
            this.blacklist_artist_ids = this.blacklist_artist_ids.filter(a => a.content != id.content);
            this.bl_artist_ids.delete(id.content);
        }
    }

    autoplay_items() {
        if (this.autoplay_state.state == "Init") {
            return this.autoplay_state.items.slice(this.autoplay_state.index);
        }
    }

    autoplay_peek_item() {
        if (this.autoplay_state.state === "Init") {
            let item = this.autoplay_state.items.at(this.autoplay_state.index)!;
            return item;
        } else {
            return null;
        }
    }

    async autoplay_skip() {
        let item = await this.autoplay_consume();
        if (item) {
            await this.add_to_blacklist(item);

            let next = this.autoplay_peek_item();
            if (next == null) {
                await this.init_with_seed(item);
            }
        } else {
            toast("No next item found", "error");
        }
    }

    async autoplay_next() {
        let item = await this.autoplay_consume();
        if (item) {
            await this.add(item);
            this.playing_index = this.items.length - 1;
            await this.play(this.playing_index);
        } else {
            toast("No next item found", "error");
        }
    }

    protected async skip_dups() {
        if (this.autoplay_state.state != "Init") {
            return;
        }

        while (true) {
            let next = this.autoplay_state.items.at(this.autoplay_state.index) ?? null;
            if (!next) {
                if (this.autoplay_state.searcher.has_next_page) {
                    this.autoplay_state.items = await this.autoplay_state.searcher.next_page();
                    next = this.autoplay_state.items.at(this.autoplay_state.index) ?? null;
                }
                if (!next) {
                    this.autoplay_state = { state: "Finished", items: this.autoplay_state.items };
                    break;
                }
            }
            let ids = next.song_ids();
            let artist_ids = next.artist_ids();
            let seen = ids.find(id => this.bl_ids?.has(id.content)) ?? null;
            let blacklist = artist_ids.find(id => this.bl_artist_ids?.has(id.content)) ?? null;
            if (seen != null || blacklist != null) {
                this.autoplay_state.index += 1;
                continue;
            } else {
                break;
            }
        }
    }

    protected async autoplay_consume() {
        if (this.autoplay_state.state != "Init") {
            return null;
        }
        let item = this.autoplay_state.items.at(this.autoplay_state.index)!;

        this.autoplay_state.index += 1;
        await this.skip_dups();

        return item;
    }

    async remove_at(index: number): Promise<void> {
        if (this.playing_index != null) {
            if (this.playing_index > index) {
                this.playing_index -= 1;
                this.items.splice(index, 1);
            } else if (this.playing_index == index) {
                if (this.items.length <= 1 && this.state != "Playing") {
                    // queue will have no items after removing
                    this.items = [];
                    this.playing_index = null;
                    this.detour();
                    return;
                } else if (index == this.items.length - 1) {
                    let item = this.autoplay_peek_item();
                    if (item != null && this.state == "Playing") {
                        this.items.splice(index, 1);
                        await this.autoplay_consume();
                        await this.add(item);
                        await this.play(this.playing_index);
                    } else {
                        if (this.items.length <= 1) {
                            this.items = [];
                            this.playing_index = null;
                            this.detour();
                        } else {
                            this.playing_index -= 1;
                            this.items.splice(index, 1);
                            if (this.state == "Playing") {
                                await this.play(this.playing_index);
                            }
                        }
                    }
                } else {
                    this.playing_index -= 1;
                    this.items.splice(index, 1);
                    if (this.state == "Playing") {
                        await this.play_next();
                    }
                }
            } else {
                // if removed item comes after the currently playing one
                this.items.splice(index, 1);
            }
        } else {
            this.items.splice(index, 1);
        }
    }

    async play_item(item: ListItem): Promise<void> {
        await super.play_item(item);

        if (this.autoplay_state.state === "Init") {
            return;
        }

        if (this.autoplay_state.state === "Disabled") {
            return;
        }

        if (this.autoplay_state.state === "DisabledWithSeed") {
            return;
        }

        await this.init_with_seed(item);
    }

    async has_next(): Promise<boolean> {
        if (await super.has_next()) {
            return true;
        } else if (this.autoplay_state.state === "Init") {
            return true;
        } else {
            return false;
        }
    }

    async play_next(): Promise<void> {
        if (await this.play_next_if_detour()) {
            return;
        }

        if (!await super.has_next()) {
            let item = await this.autoplay_consume();
            if (item) {
                await this.add(item);
            }
        }
        await super.play_next();
    }

    async add(...items: ListItem[]): Promise<void> {
        for (let e of items) {
            await this.add_to_blacklist(e);
        }
        await super.add(...items);
    }

    async insert(index: number, item: ListItem) {
        await this.add_to_blacklist(item);
        await super.insert(index, item);
    }
}

export class LocalSyncQueue extends AutoplayQueueManager {
    async add_to_blacklist(item: ListItem) {
        await super.add_to_blacklist(item);
        if (!this.blacklist_ids) {
            return;
        }
        let ids = this.blacklist_ids;

        let sync = get(stores.syncer)
        await sync.seen!.txn(async seen => {
            seen.t.songs = [...ids];
            return seen;
        });
    }
    async add_artists_to_blacklist(item: ListItem): Promise<void> {
        for (let id of item.artist_ids()) {
            await super.add_artist_to_blacklist(id);
        }

        if (!this.blacklist_artist_ids) {
            return;
        }
        let ids = this.blacklist_artist_ids;

        let sync = get(stores.syncer)
        await sync.blacklist!.txn(async bl => {
            bl.t.artists = [...ids];
            return bl;
        });
    }
    async remove_artists_from_blacklist(item: ListItem): Promise<void> {
        for (let id of item.artist_ids()) {
            await super.remove_artist_from_blacklist(id);
        }

        if (!this.blacklist_artist_ids) {
            return;
        }
        let ids = this.blacklist_artist_ids;

        let sync = get(stores.syncer)
        await sync.blacklist!.txn(async bl => {
            bl.t.artists = [...ids];
            return bl;
        });
    }
    async add_artist_to_blacklist(id: types.covau.InfoSource) {
        await super.add_artist_to_blacklist(id);

        if (!this.blacklist_artist_ids) {
            return;
        }
        let ids = this.blacklist_artist_ids;

        let sync = get(stores.syncer)
        await sync.blacklist!.txn(async bl => {
            bl.t.artists = [...ids];
            return bl;
        });
    }
    async remove_artist_from_blacklist(id: types.covau.InfoSource) {
        await super.remove_artist_from_blacklist(id);

        if (!this.blacklist_artist_ids) {
            return;
        }
        let ids = this.blacklist_artist_ids;

        let sync = get(stores.syncer)
        await sync.blacklist!.txn(async bl => {
            bl.t.artists = [...ids];
            return bl;
        });
    }

    protected async update_queue() {
        let sync = get(stores.syncer);

        await sync.queue.txn(async q => {
            let seed = this.get_seed();
            if (seed) {
                q.t.seed = (seed as db.DbListItem).t.id;
            }

            q.t.queue.current_index = this.playing_index;
            q.t.queue.queue.songs = this.items.map(item => item as db.DbListItem).map(item => item.t.id);
            return q;
        });
    }
    async add(...items: ListItem[]) {
        items = await server.db.txn(async dbops => {
            return await Promise.all(items.map(async item => {
                let e = await item.saved_covau_song(dbops);
                return db.db.wrapped(e!);
            }));
        });
            
        await super.add(...items);
        await this.update_queue();
    }
    async insert(index: number, item: ListItem) {
        await server.db.txn(async dbops => {
            let dbitem = await item.saved_covau_song(dbops);
            item = db.db.wrapped(dbitem!);
        });
        await super.insert(index, item);
        await this.update_queue();
    }
    async move(from: number, to: number): Promise<void> {
        await super.move(from, to);
        await this.update_queue();
    }
    async remove_at(index: number) {
        await super.remove_at(index);
        await this.update_queue();
    }
    async play(index: number): Promise<void> {
        await super.play(index);
        await this.update_queue();
    }
    async init_with_seed(item: ListItem): Promise<boolean> {
        await server.db.txn(async dbops => {
            let dbitem = await item.saved_covau_song(dbops);
            item = db.db.wrapped(dbitem!);
        });
        if (this.autoplay_state.state == "Uninit") {
            await stores.syncops.new.seen();
        }
        let res = await super.init_with_seed(item);
        if (res) {
            await this.update_queue();
        }
        return res;
    }
}
