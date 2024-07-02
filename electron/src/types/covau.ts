import type { ReleaseGroupWithInfo, ReleaseWithInfo, Recording } from '$types/mbz.ts';
import type { VideoId, AlbumId } from '$types/yt.ts';

export type LocalState = { queue: Queue };
export type PlaySource = { type: "File"; content: string } | { type: "YtId"; content: string };
export type InfoSource = { type: "YtId"; content: string } | { type: "MbzId"; content: string };
export type Song = { title: string; artists: string[]; thumbnails: string[]; info_sources: InfoSource[]; play_sources: PlaySource[] };
export type Playlist = { title: string; songs: number[] };
export type Queue = ListenQueue<Playlist>;
export type UpdateItem<T> = { done: boolean; points: number; added_ts: string; item: T };
export type ListenQueue<T> = { queue: T; current_index: number | null };
export type UpdateSource = { type: "Mbz"; content: { artist_id: string; release_groups: UpdateItem<ReleaseGroupWithInfo>[]; releases: UpdateItem<ReleaseWithInfo>[]; recordings: ListenQueue<UpdateItem<Recording>[]> } } | { type: "MusimanagerSearch"; content: { search_words: string[]; artist_keys: string[]; non_search_words: string[]; known_albums: UpdateItem<AlbumId>[]; songs: ListenQueue<UpdateItem<VideoId>[]> } } | { type: "SongTubeSearch"; content: { search_words: string[]; artist_keys: string[]; known_albums: UpdateItem<AlbumId>[]; songs: ListenQueue<UpdateItem<VideoId>[]> } };
export type Updater = { title: string; source: UpdateSource; last_update_ts: string; enabled: boolean };
