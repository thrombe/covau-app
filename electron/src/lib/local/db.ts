import { exhausted } from "$lib/virtual.ts";
import * as DB from "$types/db.ts";
import * as server from "$types/server.ts";

export type AlmostDbItem<T> = Omit<DB.DbItem<T>, "id">;

let server_base = `http://localhost:${import.meta.env.SERVER_PORT}/`;
export const db = {
    async insert<T>(t: AlmostDbItem<T>): Promise<DB.DbItem<T>> {
        let route = this.route(t.typ, "insert");

        let dbitem: DB.DbItem<T> = await this.api_request(server_base + route, t.t);
        return dbitem;
    },

    async update<T>(item: DB.DbItem<T>) {
        let route = this.route(item.typ, "update");

        await this.api_request_no_resp(server_base + route, item);
    },

    async delete<T>(item: DB.DbItem<T>) {
        let route = this.route(item.typ, "delete");

        await this.api_request_no_resp(server_base + route, item);
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

    async api_request<P, T>(url: string, json_payload: P) {
        let res = await fetch(
            url,
            {
                method: "POST",
                body: JSON.stringify(json_payload),
                headers: { "Content-Type": "application/json" },
            }
        );
        // console.log(res);

        let body = await res.text();

        if (!res.ok) {
            let err: server.ErrorMessage = JSON.parse(body);
            console.error(err.stack_trace);
            throw new Error(err.message);
        }

        let resp: T = JSON.parse(body);
        // console.log(resp);
        return resp;
    },

    async api_request_no_resp<P, T>(url: string, json_payload: P) {
        let res = await fetch(
            url,
            {
                method: "POST",
                body: JSON.stringify(json_payload),
                headers: { "Content-Type": "application/json" },
            }
        );
        // console.log(res);

        let body = await res.text();

        if (!res.ok) {
            let err: server.ErrorMessage = JSON.parse(body);
            console.error(err.stack_trace);
            throw new Error(err.message);
        }
    },
};

