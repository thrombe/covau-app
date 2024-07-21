import { exhausted } from "$lib/utils.ts";
import * as DB from "$types/db.ts";
import { utils } from "$lib/server.ts";
import * as types from "$types/types.ts";
import * as server from "$lib/server.ts";

export const db = {
    route(type: DB.Typ) {
        switch (type) {
            case "MmSong":
                return utils.base_url + `musimanager/search/songs`;
            case "MmAlbum":
                return utils.base_url + `musimanager/search/albums`;
            case "MmArtist":
                return utils.base_url + `musimanager/search/artists`;
            case "MmPlaylist":
                return utils.base_url + `musimanager/search/playlists`;
            case "MmQueue":
                return utils.base_url + `musimanager/search/queues`;
            case "Song":
                return utils.base_url + `covau/search/songs`;
            case "Playlist":
                return utils.base_url + `covau/search/playlists`;
            case "Queue":
                return utils.base_url + `covau/search/queues`;
            case "Updater":
                return utils.base_url + `covau/search/updaters`;
            case "StSong":
                return utils.base_url + `song_tube/search/songs`;
            case "StAlbum":
                return utils.base_url + `song_tube/search/albums`;
            case "StPlaylist":
                return utils.base_url + `song_tube/search/playlists`;
            case "StArtist":
                return utils.base_url + `song_tube/search/artists`;
            default:
                throw exhausted(type);
        }
    },

    search: {
        refid: {
            st: {
                async song(id: string) {
                    let url = db.route("StSong") + "/refid";
                    let t: types.db.DbItem<types.yt.Song> | null = await utils.api_request(url, id);
                    return t
                },
                async artist(id: string) {
                    let url = db.route("StArtist") + "/refid";
                    let t: types.db.DbItem<types.yt.Artist> | null = await utils.api_request(url, id);
                    return t
                },
            },
        },
    },

    client: () => server.dbclient!,
};

