import { type Writable, writable, derived, get, type Readable } from "svelte/store";
import { type ListItem, type Option } from "$lib/searcher/item.ts";
import * as Db from "$lib/searcher/db.ts";
import { Innertube } from "youtubei.js/web";
import * as St from "$lib/searcher/song_tube.ts";
import * as Mbz from "$lib/searcher/mbz.ts";
import { exhausted } from "$lib/virtual.ts";
import { Musiplayer } from "$lib/local/player.ts";
import { toast } from "./toast/toast";

export interface Searcher {
    next_page(): Promise<ListItem[]>;
    has_next_page: boolean;
};
export let fused_searcher = {
    async next_page() { return [] },
    has_next_page: false,
};

export class QueueManager implements Searcher {
    items: ListItem[] = [];
    has_next_page: boolean = true;;

    playing_index: number | null = null;
    state: "Unstarted" | "Playing" | "Detour" | "Finished" = "Unstarted";

    async next_page(): Promise<ListItem[]> {
        this.has_next_page = false;
        return this.items;
    }

    // async sync_state() {
    //     switch (this.state) {
    //         case "Playing": {
    //         } break;
    //         default:
    //             throw exhausted(this.state);
    //     }
    // }
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
        ];
    }
};

export type Tab = {
    name: string;
    searcher: Writable<Searcher>;
    thumbnail: string | null;
};

export type MenubarOption = { name: string } & (
    | { content_type: "music"; type: Db.Typ | St.Typ }
    | { content_type: "queue" }
    | { content_type: "watch" }
    | { content_type: "related-music"; id: string | null }
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
    { name: "Song", content_type: "music", type: "MusimanagerSong" },
    { name: "Queues", content_type: "music", type: "MusimanagerQueue" },
    { name: "Playlists", content_type: "music", type: "MusimanagerPlaylist" },
    { name: "Artist", content_type: "music", type: "MusimanagerArtist" },
    { name: "Album", content_type: "music", type: "MusimanagerAlbum" },
    { name: "Yt Song", content_type: "music", type: "song" },
    { name: "Yt Video", content_type: "music", type: "video" },
    { name: "Yt Album", content_type: "music", type: "album" },
    { name: "Yt Playlist", content_type: "music", type: "playlist" },
    { name: "Yt Artist", content_type: "music", type: "artist" },
    { name: "Related", content_type: "related-music", id: null },
]);
export let selected_menubar_option_index = writable(0);
export let selected_menubar_option: Readable<MenubarOption> = derived(
    [menubar_options, selected_menubar_option_index, query_input, tube],
    ([$options, $index, _q, _t]) => $options[$index],
);

export let tabs: Writable<Tab[]> = writable([{
    name: "Results",
    searcher: writable(fused_searcher),
    thumbnail: null,
}]);
export let curr_tab_index = writable(0);

export let curr_tab = derived(
    [tabs, curr_tab_index],
    ([$tabs, $index]) => $tabs[$index],
);
// export let searcher = derived(
//     curr_tab,
//     ($curr_tab) => get($curr_tab.searcher),
// );

export let queue: Writable<QueueManager> = writable(new QueueManager());

export let playing_item: Writable<ListItem> = writable();
// TODO: also allow sync/player
export let player: Writable<Musiplayer> = writable();
(async () => {
    let musiplayer = await import("$lib/local/player.ts");
    let pl = new musiplayer.Musiplayer();
    player.set(pl);
})()

selected_menubar_option.subscribe(async (option) => {
    if (!get(tube)) {
        return;
    }
    let s: Searcher;
    switch (option.content_type) {
        case "music": {
            switch (option.type) {
                case "MusimanagerSong":
                case "MusimanagerAlbum":
                case "MusimanagerArtist":
                case "MusimanagerPlaylist":
                case "MusimanagerQueue":
                    s = Db.Db.new({
                        query_type: "search",
                        type: option.type,
                        query: get(query_input),
                    }, page_size);
                    break;
                case "song":
                case "video":
                case "album":
                case "playlist":
                case "artist":
                    s = St.SongTube.new({
                        query_type: "search",
                        query: get(query_input),
                        search: option.type,
                    }, get(tube));
                    break;
                default:
                    throw exhausted(option.type);
            }
            tabs.update(t => {
                t = [t[0]];
                t[0].searcher.set(s);
                return t;
            });
            curr_tab_index.set(0);
        } break;
        case "queue":
            break
        case "watch":
            break
        case "related-music":
            break
        case "home-feed": {
            let st = await import("$lib/searcher/song_tube.ts");
            let s = st.SongTube.new({
                query_type: "home-feed",
            }, get(tube));
            tabs.update(t => {
                t = [t[0]];
                t[0].searcher.set(s);
                return t;
            });
            curr_tab_index.set(0);
        } break;
        default:
            exhausted(option);
    }
});
