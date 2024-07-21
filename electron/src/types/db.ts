export type SearchMatches<T> = { items: DbItem<T>[]; continuation: SearchContinuation | null };
export type DbMetadata = { done: boolean; likes: number; dislikes: number; interactions: number; update_counter: number; added_ts: string; updated_ts: string };
export type DbItem<T> = { metadata: DbMetadata; id: number; typ: Typ; t: T };
export type Typ = "MmSong" | "MmAlbum" | "MmArtist" | "MmPlaylist" | "MmQueue" | "Song" | "Playlist" | "Queue" | "Updater" | "StSong" | "StAlbum" | "StPlaylist" | "StArtist";
export type SearchQuery = { type: "Query"; content: { page_size: number; query: string } } | { type: "Continuation"; content: SearchContinuation };
export type SearchContinuation = { typ: Typ; page_size: number; query: string; cont: string };
