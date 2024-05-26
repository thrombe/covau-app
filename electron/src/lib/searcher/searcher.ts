
import { YTNodes, SongTube, type MusicListItem } from './song_tube';

export type RObject<T> =
    T extends MusicListItem
    ? ReturnType<typeof SongTube.obj_type>

    // OOF:
    : ReturnType<typeof SongTube.obj_type>;


export type RSearcher<T> =
    T extends MusicListItem
    ? ReturnType<typeof SongTube.new>

    // OOF:
    : ReturnType<typeof SongTube.new>;


export type RFactory<T> = 
    T extends MusicListItem
    ? ReturnType<typeof SongTube.factory>

    // OOF:
    : ReturnType<typeof SongTube.factory>;


export type Keyed = { get_key(): unknown };


