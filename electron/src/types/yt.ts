export type Thumbnail = { url: string; width: number; height: number };
export type Album = { id: string; title: string | null; thumbnails: Thumbnail[]; author: Author | null };
export type AlbumId = { name: string; id: string };
export type Artist = { id: string; name: string | null; subscribers: string | null; thumbnails: Thumbnail[] };
export type Author = { name: string; channel_id: string | null };
export type Playlist = { id: string; title: string | null; thumbnails: Thumbnail[]; author: Author | null };
export type Song = { id: string; title: string | null; thumbnails: Thumbnail[]; authors: Author[]; album: AlbumId | null };
export type Video = { id: string; title: string | null; thumbnails: Thumbnail[]; authors: Author[] };
