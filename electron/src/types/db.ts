export type SearchMatches<T> = { items: DbItem<T>[]; continuation: SearchContinuation | null };
export type DbItem<T> = { id: number; typ: Typ; t: T };
export type Typ = "MmSong" | "MmAlbum" | "MmArtist" | "MmPlaylist" | "MmQueue" | "Song" | "Playlist" | "Queue" | "Updater" | "StSong" | "StVideo" | "StAlbum" | "StPlaylist" | "StArtist";
export type SearchQuery = { type: "Query"; content: { page_size: number; query: string } } | { type: "Continuation"; content: SearchContinuation };
export type SearchContinuation = { typ: Typ; page_size: number; query: string; cont: string };
