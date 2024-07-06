import { exhausted } from "$lib/virtual.ts";
import * as DB from "$types/db.ts";
import * as server from "$types/server.ts";
import { utils } from "$lib/server.ts";

export type AlmostDbItem<T> = Omit<Omit<DB.DbItem<T>, "id">, "metadata">;

function db_cud(id: number) {
    return {
        id: id,

        async insert_or_get<T>(t: AlmostDbItem<T>): Promise<server.InsertResponse<DB.DbItem<T>>> {
            let route = db.route(t.typ, "insert");

            let txn: server.WithTransaction<T> = {
                transaction_id: this.id,
                t: t.t,
            };
            let dbitem: server.InsertResponse<DB.DbItem<T>> = await utils.api_request(route, txn);
            return dbitem;
        },

        async update<T>(item: DB.DbItem<T>) {
            let route = db.route(item.typ, "update");

            let txn: server.WithTransaction<DB.DbItem<T>> = {
                transaction_id: this.id,
                t: item,
            };
            let dbitem: DB.DbItem<T> = await utils.api_request(route, txn);
            return dbitem;
        },

        async update_metadata<T>(item: DB.DbItem<T>) {
            let route = db.route(item.typ, "update_metadata");

            let txn: server.WithTransaction<server.UpdateMetadataQuery> = {
                transaction_id: this.id,
                t: {
                    id: item.id,
                    metadata: item.metadata,
                },
            };
            let dbitem: DB.DbMetadata = await utils.api_request(route, txn);
            return dbitem;
        },

        async delete<T>(item: DB.DbItem<T>) {
            let route = db.route(item.typ, "delete");

            let txn: server.WithTransaction<DB.DbItem<T>> = {
                transaction_id: this.id,
                t: item,
            };
            await utils.api_request_no_resp(route, txn);
        },
    }
};

export type DbOps = ReturnType<typeof db_cud>;
export const db = {
    route(type: DB.Typ, op: "search" | "insert" | "update" | "update_metadata" | "delete") {
        switch (type) {
            case "MmSong":
                return utils.base_url + `musimanager/${op}/songs`;
            case "MmAlbum":
                return utils.base_url + `musimanager/${op}/albums`;
            case "MmArtist":
                return utils.base_url + `musimanager/${op}/artists`;
            case "MmPlaylist":
                return utils.base_url + `musimanager/${op}/playlists`;
            case "MmQueue":
                return utils.base_url + `musimanager/${op}/queues`;
            case "Song":
                return utils.base_url + `covau/${op}/songs`;
            case "Playlist":
                return utils.base_url + `covau/${op}/playlists`;
            case "Queue":
                return utils.base_url + `covau/${op}/queues`;
            case "Updater":
                return utils.base_url + `covau/${op}/updaters`;
            case "StSong":
                return utils.base_url + `song_tube/${op}/songs`;
            case "StVideo":
                return utils.base_url + `song_tube/${op}/videos`;
            case "StAlbum":
                return utils.base_url + `song_tube/${op}/albums`;
            case "StPlaylist":
                return utils.base_url + `song_tube/${op}/playlists`;
            case "StArtist":
                return utils.base_url + `song_tube/${op}/artists`;
            default:
                throw exhausted(type);
        }
    },

    async begin() {
        let id: number = await utils.api_request(utils.base_url + "db/transaction/begin", null);
        return id;
    },

    async commit(id: number) {
        await utils.api_request_no_resp(utils.base_url + "db/transaction/commit", id);
    },

    async rollback(id: number) {
        await utils.api_request_no_resp(utils.base_url + "db/transaction/rollback", id);
    },

    async txn<Ret>(fn: ((db_ops: DbOps) => Promise<Ret>)) {
        let id = await this.begin();
        try {
            let res = await fn(db_cud(id));
            await this.commit(id);
            return res;
        } catch (e: any) {
            await this.rollback(id);

            throw e;
        }
    },
};

