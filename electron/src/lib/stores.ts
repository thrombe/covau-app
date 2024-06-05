import { type Writable, writable, derived, get, type Readable } from "svelte/store";
import { type ListItem } from "$lib/searcher/item.ts";
import * as Db from "$lib/searcher/db.ts";
import { Innertube } from "youtubei.js/web";
import * as St from "$lib/searcher/song_tube.ts";
import * as Mbz from "$lib/searcher/mbz.ts";
import { exhausted } from "$lib/virtual.ts";

export interface Searcher {
    next_page(): Promise<ListItem[]>;
    // next_page(): Promise<unknown[]>;
    has_next_page: boolean;
};
export let fused_searcher = { async next_page() { return [] }, has_next_page: false };

export type Tab = {
    name: string;
    searcher: Searcher;
    thumbnail: string | null;
};

export type MenubarOption = { name: string } & (
    | { content_type: "music"; type: Db.Typ }
    | { content_type: "queue" }
    | { content_type: "watch" }
    | { content_type: "related-music"; id: string | null }
    | { content_type: "home-feed" }
);

let page_size = 30;

export type Source = "Musicbrainz" | "Musimanager" | "Youtube";
export let sources: Source[] = ["Musimanager", "Youtube", "Musicbrainz"]
export let source: Writable<Source> = writable("Musimanager");

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
    { name: "Related", content_type: "related-music", id: null },
]);
export let selected_menubar_option_index = writable(0);
export let selected_menubar_option: Readable<MenubarOption> = derived(
    [menubar_options, selected_menubar_option_index],
    ([$options, $index]) => $options[$index],
);

export let query_input = writable("");

export let tabs: Writable<Tab[]> = writable([{
    name: "Results",
    searcher: fused_searcher,
    thumbnail: null,
}]);
export let curr_tab_index = writable(0);

export let curr_tab = derived(
    [tabs, curr_tab_index],
    ([$tabs, $index]) => $tabs[$index],
);
export let searcher = derived(
    curr_tab,
    ($curr_tab) => $curr_tab.searcher,
);

export let queue_searcher: Writable<Searcher> = writable(fused_searcher);

// NOTE: initialized in wrap components
export let tube: Writable<Innertube> = writable();



selected_menubar_option.subscribe(async (option) => {
    switch (option.content_type) {
        case "music":
            tabs.set([{
                name: "Results",
                searcher: Db.Db.new({
                    query_type: "search",
                    type: option.type,
                    query: get(query_input),
                }, page_size),
                thumbnail: null,
            }]);
            break
        case "queue":
            break
        case "watch":
            break
        case "related-music":
            break
        case "home-feed":
            tabs.set([{
                name: "Results",
                searcher: St.SongTube.new({ query_type: "home-feed" }, get(tube)),
                thumbnail: null,
            }]);
            break
        default:
            exhausted(option);
    }
});
