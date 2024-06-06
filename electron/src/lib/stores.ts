import { type Writable, writable, derived, get, type Readable } from "svelte/store";
import { type ListItem } from "$lib/searcher/item.ts";
import * as Db from "$lib/searcher/db.ts";
import { Innertube } from "youtubei.js/web";
import * as St from "$lib/searcher/song_tube.ts";
import * as Mbz from "$lib/searcher/mbz.ts";
import { exhausted } from "$lib/virtual.ts";
import { Musiplayer } from "$lib/local/player.ts";

export interface Searcher {
    next_page(): Promise<ListItem[]>;
    has_next_page: boolean;
};
export let fused_searcher = {
    async next_page() { return [] },
    has_next_page: false,
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

export let queue_searcher: Writable<Searcher> = writable(fused_searcher);

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
