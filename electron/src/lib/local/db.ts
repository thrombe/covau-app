import { exhausted } from "$lib/virtual.ts";
import * as DB from "$types/db.ts";
import * as server from "$types/server.ts";
import { utils } from "$lib/server.ts";

export type AlmostDbItem<T> = Omit<DB.DbItem<T>, "id">;

let server_base = `http://localhost:${import.meta.env.SERVER_PORT}/`;
export const db = {
    async insert<T>(t: AlmostDbItem<T>): Promise<server.InsertResponse<DB.DbItem<T>>> {
        let route = this.route(t.typ, "insert");

        let dbitem: server.InsertResponse<DB.DbItem<T>> = await utils.api_request(server_base + route, t.t);
        return dbitem;
    },

    async update<T>(item: DB.DbItem<T>) {
        let route = this.route(item.typ, "update");

        await utils.api_request_no_resp(server_base + route, item);
    },

    async delete<T>(item: DB.DbItem<T>) {
        let route = this.route(item.typ, "delete");

        await utils.api_request_no_resp(server_base + route, item);
    },

    route(type: DB.Typ, op: "search" | "insert" | "update" | "delete") {
        switch (type) {
            case "MmSong":
                return server_base + `musimanager/${op}/songs`;
            case "MmAlbum":
                return server_base + `musimanager/${op}/albums`;
            case "MmArtist":
                return server_base + `musimanager/${op}/artists`;
            case "MmPlaylist":
                return server_base + `musimanager/${op}/playlists`;
            case "MmQueue":
                return server_base + `musimanager/${op}/queues`;
            case "Song":
                return server_base + `covau/${op}/songs`;
            case "Playlist":
                return server_base + `covau/${op}/playlists`;
            case "Queue":
                return server_base + `covau/${op}/queues`;
            case "Updater":
                return server_base + `covau/${op}/updaters`;
            case "StSong":
                return server_base + `song_tube/${op}/songs`;
            case "StVideo":
                return server_base + `song_tube/${op}/videos`;
            case "StAlbum":
                return server_base + `song_tube/${op}/albums`;
            case "StPlaylist":
                return server_base + `song_tube/${op}/playlists`;
            case "StArtist":
                return server_base + `song_tube/${op}/artists`;
            default:
                throw exhausted(type);
        }
    },
};

