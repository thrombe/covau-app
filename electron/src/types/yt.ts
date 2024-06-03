export type Video = { title: string; id: string; album: Album | null };
export type VideoWithInfo = ({ title: string; id: string; album: Album | null }) & { titles: string[]; thumbnail_url: string; album_name: string | null; artist_names: string[]; channel_id: string };
export type Album = { name: string; browse_id: string };
export type AlbumWithInfo = ({ name: string; browse_id: string }) & { playlist_id: string; songs: Video[]; artist_name: string; artist_keys: string[] };
