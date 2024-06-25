import { db } from "./db.ts";
import { player, playing_item, queue } from "$lib/stores.ts";
import type { ListItem, Option } from "$lib/searcher/item.ts";
import { toast } from "$lib/toast/toast.ts";
import { prompt } from "$lib/prompt/prompt.ts";
import type { Searcher } from "$lib/searcher/searcher.ts";

import * as covau from "$types/covau.ts";
import * as DB from "$types/db.ts";
import { exhausted } from "$lib/virtual.ts";
import { SongTube } from "$lib/searcher/song_tube.ts";
import * as mbz from "$lib/searcher/mbz.ts";


export class QueueManager implements Searcher {
    items: ListItem[] = [];
    playing_index: number | null = null;

    state: "Unstarted" | "Playing" | "Detour" | "Finished" = "Unstarted";

    has_next_page: boolean = true;
    async next_page(): Promise<ListItem[]> {
        this.has_next_page = false;
        return this.items;
    }

    detour() {
        this.state = "Detour";
    }
    finished() {
        this.state = "Finished";
        player.update(p => {
            p.pause();
            return p;
        });
    }
    async play_queue_item(item: ListItem) {
        for (let i = 0; i < this.items.length; i++) {
            if (this.items[i].key() == item.key()) {
                this.playing_index = i;
                await this.play(i);
                return;
            }
        }

        toast(`item "${item.title()}" not in queue`, "error");
    }
    async remove_queue_item(item: ListItem) {
        for (let i = 0; i < this.items.length; i++) {
            if (this.items[i].key() == item.key()) {
                await this.remove(i);
                return;
            }
        }

        toast(`item "${item.title()}" not in queue`, "error");
    }
    async add(...items: ListItem[]) {
        for (let item of items) {
            if (this.items.find((a) => a.key() == item.key())) {
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
            await this.play_item(item);
        } else {
            toast(`no item at index ${index}`, "error");
        }
    }
    protected async play_item(item: ListItem) {
        let uri = await item.audio_uri().catch(e => {
            toast(e, "error");
            return null;
        });
        if (uri) {
            player.update(p => {
                p.play(uri);
                return p;
            });
            playing_item.set(item);
            this.state = "Playing";
        } else {
            toast("could not play item", "error");
        }
    }

    options(): Option[] {
        return [
            {
                tooltip: "empty queue",
                icon: "/static/remove.svg",
                location: "OnlyMenu",
                onclick: () => {
                    queue.update(q => {
                        let new_q = new QueueManager();
                        if (q.state == "Playing") {
                            new_q.detour();
                        }
                        return new_q;
                    })
                },
            },
            {
                tooltip: "save queue",
                icon: "/static/floppy-disk.svg",
                location: "OnlyMenu",
                onclick: async () => {
                    let name = await prompt("Enter queue name");
                    if (!name) {
                        return;
                    }

                    // TODO: this should be atomic

                    let items = await Promise.all(this.items.map(async (item) => {
                        let song = item.savable();
                        if (!song || song.typ != "Song") {
                            let msg = `item: ${item.title()} can't be saved in db`;
                            toast(msg, "error");
                            throw new Error(msg);
                        }
                        return await db.insert(song);
                    }));
                    let queue: covau.Queue = {
                        current_index: this.playing_index,
                        queue: {
                            title: name,
                            songs: items.map(t => t.id),
                        },
                    };
                    await db.insert({ typ: "Queue", t: queue });
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

export class AutoplayQueueManager extends QueueManager {
    autoplay_searcher: Searcher | null = null;
    autoplay_items: ListItem[] = [];
    autoplay_index: number | null = null;
    autoplayed_cache: Set<string> = new Set();

    protected reset_autoplay() {
        this.autoplay_searcher = null;
        this.autoplay_items = [];
        this.autoplay_index = null;

        // NOTE: don't reset cache
        // this.autoplayed_cache = new Set();
    }

    // TODO: consider cache
    protected async has_next_autoplay(): Promise<boolean> {
        if (this.autoplay_index == null) {
            if (this.autoplay_items.length > 0) {
                return true;
            }
        } else {
            if (this.autoplay_items.length - 1 > this.autoplay_index) {
                return true;
            }
        }

        if (!this.autoplay_searcher) {
            return false;
        }

        if (!this.autoplay_searcher.has_next_page) {
            return false;
        } else {
            this.autoplay_items = await this.autoplay_searcher.next_page();
            return await this.has_next_autoplay();
        }
    }

    protected autoplay_get_item() {
        if (this.autoplay_index != null) {
            return this.autoplay_items[this.autoplay_index];
        } else {
            return null;
        }
    }

    protected autoplay_peek_item() {
        if (this.autoplay_index != null) {
            return this.autoplay_items.at(this.autoplay_index + 1) ?? null;
        } else {
            return this.autoplay_items.at(0) ?? null;
        }
    }

    protected async autoplay_next_item() {
        if (await this.has_next_autoplay()) {
            if (this.autoplay_index != null) {
                this.autoplay_index += 1;
                return this.autoplay_get_item();
            } else {
                this.autoplay_index = 0;
                return this.autoplay_get_item();
            }
        }
        return null;
    }

    protected async play_item(item: ListItem): Promise<void> {
        await super.play_item(item);

        if (await this.has_next_autoplay()) {
            return;
        }

        let playing_index = this.playing_index ?? this.items.length - 1;
        let query = await autoplay_try_all(this.items[playing_index]);
        if (!query) {
            return;
        }

        this.reset_autoplay();
        this.autoplay_searcher = await autoplay_searcher(query);
    }

    async has_next(): Promise<boolean> {
        if (await super.has_next()) {
            return true;
        } else if (await this.has_next_autoplay()) {
            return true;
        } else {
            return false;
        }
    }

    async play_next(): Promise<void> {
        if (!await super.has_next()) {
            let item = await this.autoplay_next_item();
            if (item) {
                await this.add(item);
            }
        }
        await super.play_next();
    }
}

// export class DbQueueManager extends QueueManager {
//     queue: DB.DbItem<covau.Queue> = { current_index: null, queue: { title: "Queue", songs: []}};

//     async new() {
        
//     }
// }
