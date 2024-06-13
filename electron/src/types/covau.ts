import type { ReleaseGroupWithInfo, ReleaseWithInfo, Recording } from '$types/mbz.ts';
import type { Album, Video } from '$types/yt.ts';

export type PlaySource = { type: "File"; content: string } | { type: "YtId"; content: string };
export type Song = { title: string; mbz_id: string | null; sources: PlaySource[] };
export type UpdateItem<T> = { done: boolean; points: number; item: T };
export type ListenQueue<T> = { queue: T; current_index: number };
export type UpdateSource = { type: "Mbz"; content: { artist_id: string; release_groups: UpdateItem<ReleaseGroupWithInfo>[]; releases: UpdateItem<ReleaseWithInfo>[]; recordings: ListenQueue<UpdateItem<Recording>[]> } } | { type: "MusimanagerSearch"; content: { search_words: string[]; artist_keys: string[]; non_search_words: string[]; known_albums: UpdateItem<Album>[]; songs: ListenQueue<UpdateItem<Video>[]> } } | { type: "SongTubeSearch"; content: { search_words: string[]; artist_keys: string[]; known_albums: UpdateItem<Album>[]; songs: ListenQueue<UpdateItem<Video>[]> } };
export type Updater = { title: string; source: UpdateSource; last_update_ts: number; enabled: boolean };
