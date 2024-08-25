import type { VideoId, AlbumId } from '$types/yt.ts';
import type { SourcePath } from '$types/covau.ts';

export type SongInfo = { titles: string[]; video_id: string; duration: number | null; tags: string[]; thumbnail_url: string; album: string | null; artist_names: string[]; channel_id: string; uploader_id: string | null };
export type Song<I, P> = { title: string; key: string; artist_name: string | null; info: I; last_known_path: P | null };
export type Artist<S, A> = { name: string; keys: string[]; check_stat: boolean; ignore_no_songs: boolean; name_confirmation_status: boolean; songs: S[]; known_albums: A[]; keywords: string[]; non_keywords: string[]; search_keywords: string[]; last_auto_search: number | null; unexplored_songs?: S[] };
export type Album<S> = { name: string; browse_id: string; playlist_id: string | null; songs: S[]; artist_name: string; artist_keys: string[] };
export type SongProvider<S> = { name: string; data_list: S[]; current_index: number };
export type EntityTracker = { songs: (Song<SongInfo | null, SourcePath>)[]; albums: Album<VideoId>[]; artists: (Artist<VideoId, AlbumId>)[]; playlists: Playlist<VideoId>[]; queues: Queue<VideoId>[] };
export type Tracker<S, A> = { artists: (Artist<S, A>)[]; auto_search_artists: (Artist<S, A>)[]; playlists: SongProvider<S>[]; queues: SongProvider<S>[] };
export type Playlist<S> = SongProvider<S>;
export type Queue<S> = SongProvider<S>;
