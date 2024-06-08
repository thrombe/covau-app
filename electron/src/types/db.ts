export type SearchMatches<T> = { items: DbItem<T>[]; continuation: SearchContinuation | null };
export type DbItem<T> = { id: number; typ: Typ; t: T };
export type Typ = "MusimanagerSong" | "MusimanagerAlbum" | "MusimanagerArtist" | "MusimanagerPlaylist" | "MusimanagerQueue";
export type SearchQuery = { type: "Query"; content: { page_size: number; query: string } } | { type: "Continuation"; content: SearchContinuation };
export type SearchContinuation = { typ: Typ; page_size: number; query: string; cont: string };
