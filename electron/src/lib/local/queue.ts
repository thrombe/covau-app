import { db } from "./db.ts";
import { player, playing_item, queue } from "$lib/stores.ts";
import type { ListItem, Option } from "$lib/searcher/item.ts";
import { toast } from "$lib/toast/toast.ts";
import { prompt } from "$lib/prompt/prompt.ts";
import type { Searcher } from "$lib/searcher/searcher.ts";

import * as covau from "$types/covau.ts";
import * as DB from "$types/db.ts";


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
    async play_item(item: ListItem) {
        for (let i = 0; i < this.items.length; i++) {
            if (this.items[i].key() == item.key()) {
                this.playing_index = i;
                await this.play(i);
                return;
            }
        }

        toast(`item "${item.title()}" not in queue`, "error");
    }
    async remove_item(item: ListItem) {
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
    has_prev() {
        if (this.playing_index != null) {
            return this.playing_index > 0;
        } else {
            return false;
        }
    }
    has_next() {
        if (this.playing_index != null) {
            return this.items.length > this.playing_index + 1;
        } else {
            return this.items.length > 0;
        }
    }
    async play(index: number) {
        let item = this.items.at(index);
        if (item) {
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
        } else {
            toast(`no item at index ${index}`, "error");
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
