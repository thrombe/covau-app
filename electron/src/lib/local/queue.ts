import { db } from "./db.ts";
import { player, playing_item, queue } from "$lib/stores.ts";
import type { ListItem, Option } from "$lib/searcher/item.ts";
import { toast } from "$lib/toast/toast.ts";
import { prompter } from "$lib/prompt/prompt.ts";
import type { Searcher } from "$lib/searcher/searcher.ts";
import * as icons from "$lib/icons.ts";

import * as covau from "$types/covau.ts";
import { exhausted } from "$lib/utils.ts";
import { SongTube } from "$lib/searcher/song_tube.ts";
import * as mbz from "$lib/searcher/mbz.ts";
import { get } from "svelte/store";
import { Db } from "$lib/searcher/db.ts";


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
        this.state = "Unstarted";
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
    async remove_queue_item(item: ListItem) {
        let index = this.get_item_index(item);
        if (index) {
            await this.remove(index);
        } else {
            toast(`item "${item.title()}" not in queue`, "error");
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
    async remove(index: number) {
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
            if (this.playing_index == null) {
                this.playing_index = 0;
            }
            await this.play(this.playing_index);
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
    async play_next() {
        if (this.state == "Detour") {
            if (this.playing_index == null) {
                this.playing_index = 0;
            }
            await this.play(this.playing_index);
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

    async  handle_drop(item: ListItem, target: number | null, is_outsider: boolean): Promise<boolean> {
        if (!item.is_playable()) {
            return false;
        }
        if (is_outsider) {
            if (target == null) {
                target = this.items.length;
            }
            await this.insert(target, item);
        } else {
            if (target == null) {
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
                location: "OnlyMenu",
                onclick: () => {
                    let q = get(queue) as AutoplayQueueManager;
                    let state = q.state;
                    q.reset();
                    if (state == "Playing") {
                        q.detour();
                    }
                    queue.update(q => q);
                },
            },
            {
                title: "save queue",
                icon: icons.floppy_disk,
                location: "OnlyMenu",
                onclick: async () => {
                    let _name = await prompter.prompt("Enter queue name");
                    if (!_name) {
                        return;
                    }
                    let name = _name;

                    await db.txn(async (db) => {
                        let items = await Promise.all(this.items.map(async (item) => {
                            let song = await item.saved_covau_song(db);
                            if (!song) {
                                let msg = `item: ${item.title()} can't be saved in db`;
                                toast(msg, "error");
                                throw new Error(msg);
                            }
                            return song
                        }));
                        let queue: covau.Queue = {
                            current_index: this.playing_index,
                            queue: {
                                title: name,
                                songs: items.map(t => t.id),
                            },
                        };
                        await db.insert_or_get({ typ: "Queue", t: queue });
                    });
                    toast(`queue ${name} saved`, "info")
                },
            },
            {
                title: "reseed autoplay",
                icon: icons.repeat,
                location: "OnlyMenu",
                onclick: async () => {
                    let q = get(queue) as AutoplayQueueManager;
                    let item = q.items.at(q.playing_index ?? (q.items.length - 1)) ?? null;
                    if (!item) {
                        toast("no item in queue. can't pick autoplay seed", "error");
                        return;
                    }

                    await q.init_with_seed(item);
                },
            },
            {
                title: "searcher prompt test",
                icon: icons.covau_icon,
                location: "OnlyMenu",
                onclick: async () => {
                    let new_searcher = (q: string) => Db.new({
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

export async function autoplay_searcher(q: AutoplayQueryInfo) {
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

type AutoplayState = {
    state: 'Uninit';
} | {
    state: 'Disabled';
} | {
    state: 'Init';
    searcher: Searcher;
    seed_item: ListItem;
    items: ListItem[];
    index: number; // index is always valid
} | {
    state: "Finished";
    items: ListItem[];
};

export class AutoplayQueueManager extends QueueManager {
    autoplay_state: AutoplayState = { state: "Disabled" };
    autoplayed_ids: Set<string> = new Set();

    autoplay_toggle() {
        if (this.autoplay_state.state === "Disabled") {
            this.autoplay_state = { state: "Uninit" };
        } else {
            this.autoplay_state = { state: "Disabled" };
        }
    }

    autoplay_disable() {
        this.autoplay_state = { state: "Disabled" };
    }

    autoplay_enable() {
        if (this.autoplay_state.state === "Disabled") {
            this.autoplay_state = { state: "Uninit" };
        }
    }

    autoplay_is_enabled() {
        return this.autoplay_state.state !== "Disabled";
    }

    reset() {
        super.reset();
        this.autoplay_state = { state: "Disabled" };
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

        let ids = item.song_ids();
        for (let id of ids) {
            this.autoplayed_ids.add(id);
        }

        this.autoplay_state = {
            state: "Init",
            searcher,
            seed_item: item,
            items,
            index: 0,
        };

        await this.skip_dups();

        return true;
    }

    protected autoplay_peek_item() {
        if (this.autoplay_state.state === "Init") {
            let item = this.autoplay_state.items.at(this.autoplay_state.index)!;
            return item;
        } else {
            return null;
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
            if (ids.find(id => this.autoplayed_ids.has(id))) {
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

    async play_item(item: ListItem): Promise<void> {
        await super.play_item(item);

        if (this.autoplay_state.state === "Init") {
            return;
        }

        if (this.autoplay_state.state === "Disabled") {
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
        if (!await super.has_next()) {
            let item = await this.autoplay_consume();
            if (item) {
                await this.add(item);
            }
        }
        await super.play_next();
    }

    async add(...items: ListItem[]): Promise<void> {
        items.forEach(e => {
            let ids = e.song_ids();
            for (let id of ids) {
                this.autoplayed_ids.add(id);
            }
        });
        await super.add(...items);
    }

    async insert(index: number, item: ListItem) {
        let ids = item.song_ids();
        for (let id of ids) {
            this.autoplayed_ids.add(id);
        }
        await super.insert(index, item);
    }
}

// export class DbQueueManager extends QueueManager {
//     queue: DB.DbItem<covau.Queue> = { current_index: null, queue: { title: "Queue", songs: []}};

//     async 
//     }
// }
