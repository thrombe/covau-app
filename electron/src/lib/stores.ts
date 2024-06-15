import { type Writable, writable, derived, get, type Readable } from "svelte/store";
import { type ListItem } from "$lib/searcher/item.ts";
import * as Db from "$lib/searcher/db.ts";
import { Innertube } from "youtubei.js/web";
import * as St from "$lib/searcher/song_tube.ts";
import * as Mbz from "$lib/searcher/mbz.ts";
import { exhausted } from "$lib/virtual.ts";
import { Musiplayer } from "$lib/local/player.ts";
import { toast } from "./toast/toast";
import { QueueManager } from "./local/queue.ts";
import { type Searcher, fused_searcher } from "./searcher/searcher.ts";

export type Tab = {
    name: string;
    searcher: Writable<Searcher>;
    thumbnail: string | null;
};

export type MenubarOption = { name: string } & (
    | { content_type: "list"; type: Db.Typ | St.Typ | Mbz.SearchTyp | "covau-group" }
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
    { name: "Covau Group", content_type: "list", type: "covau-group" },
    { name: "Related", content_type: "related-music", id: null },
]);
export let selected_menubar_option_index = writable(0);
let tab_updater = writable(1);
export const refresh_tab = () => {
    tab_updater.update(t => t+1);
};
export let selected_menubar_option: Readable<MenubarOption> = derived(
    [menubar_options, selected_menubar_option_index, tab_updater, tube],
    ([$options, $index, _u, _t]) => $options[$index],
);

export let tabs: Writable<Tab[]> = writable([{
    name: "Results",
    searcher: writable(fused_searcher),
    thumbnail: null,
}]);
export let curr_tab_index = writable(0);
export const push_tab = (s: Searcher, title: string, thumb: string | null = null) => {
    let index = get(curr_tab_index);
    tabs.update(t => {
        t = [...t.slice(0, index+1)];
        t.push({
            name: title,
            searcher: writable(s),
            thumbnail: thumb,
        });
        return t;
    });
    curr_tab_index.set(get(tabs).length - 1);
};

export let curr_tab = derived(
    [tabs, curr_tab_index],
    ([$tabs, $index]) => $tabs[$index],
);
// export let searcher = derived(
//     curr_tab,
//     ($curr_tab) => get($curr_tab.searcher),
// );

export let playing_item: Writable<ListItem> = writable();
// TODO: also allow sync/player
export let player: Writable<Musiplayer> = writable();
(async () => {
    let musiplayer = await import("$lib/local/player.ts");
    let pl = new musiplayer.Musiplayer();
    player.set(pl);
})()

export let queue: Writable<QueueManager> = writable(new QueueManager());

selected_menubar_option.subscribe(async (option) => {
    if (!get(tube)) {
        return;
    }
    let s: Searcher;
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
                    s = Db.Db.new({
                        query_type: "search",
                        type: option.type,
                        query: get(query_input),
                    }, page_size);
                } break;
                case "YtSong":
                case "YtVideo":
                case "YtAlbum":
                case "YtPlaylist":
                case "YtArtist": {
                    s = St.SongTube.new({
                        type: "Search",
                        content: {
                            query: get(query_input),
                            search: option.type
                        },
                    });
                } break;
                case "MbzReleaseWithInfo":
                case "MbzReleaseGroupWithInfo":
                case "MbzArtist":
                case "MbzRecordingWithInfo": {
                    s = Mbz.Mbz.new({
                        query_type: "search",
                        type: option.type,
                        query: get(query_input),
                    }, 30);
                } break;
                case "covau-group": {
                    if (!get(query_input)) {
                        s = fused_searcher;
                        break;
                    }

                    let f_app = await import("firebase/app");
                    let f_store = await import("firebase/firestore");
                    let f_config = await import("../firebase_config");
                    let app = f_app.initializeApp(f_config.firebase_config);
                    let db = f_store.getFirestore(app);
                    let data_ref = f_store.doc(db, 'groups', get(query_input));
                    let data = await f_store.getDoc(data_ref);
                    let covau = data.data();
                    if (!covau) {
                        toast("could not load data", "error");
                        return;
                    }
                    let ids: string[] = covau.queue;
                    s = St.SongTube.new({
                        type: "SongIds",
                        content: {
                            ids,
                            batch_size: 10,
                        },
                    });
                } break;
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
                type: "HomeFeed",
            });
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
