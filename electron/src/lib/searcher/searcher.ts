
import { YTNodes, SongTube, type MusicListItem } from './song_tube';
import { Db, type Song } from "./db";

// this should onlybe used for the type parameter in the types below
export interface ForceDb<_> {
    force: null;
}

export type RObject<T> =
    // a hacky way to force match this
    T extends ForceDb<infer E>
    ? ReturnType<typeof Db.obj_type<E>>

    : T extends MusicListItem
    ? ReturnType<typeof SongTube.obj_type>

    // OOF:
    : never;

type Obj = RObject<ForceDb<Song>>;

export type RSearcher<T> =
    T extends ForceDb<infer E>
    ? ReturnType<typeof Db.new<T>>

    : T extends MusicListItem
    ? ReturnType<typeof SongTube.new>

    // OOF:
    : ReturnType<typeof SongTube.new>;

export type RFactory<T> = 
    T extends ForceDb<infer E>
    ? ReturnType<typeof Db.factory>

    : T extends MusicListItem
    ? ReturnType<typeof SongTube.factory>

    // OOF:
    : ReturnType<typeof SongTube.factory>;


export type Keyed = { get_key(): unknown };
