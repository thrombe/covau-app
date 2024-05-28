export type SearchMatches<T> = { items: T[]; continuation: SearchContinuation | null };
export type Typ = "MusimanagerSong" | "MusimanagerAlbum" | "MusimanagerArtist" | "MusimanagerPlaylist" | "MusimanagerQueue";
export type SearchQuery = { type: "Query"; content: { page_size: number; query: string } } | { type: "Continuation"; content: SearchContinuation };
export type SearchContinuation = { typ: Typ; page_size: number; query: string; cont: string };
