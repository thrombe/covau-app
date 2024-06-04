export type Recording = { title: string; id: string; releases: Release[] };
export type ReleaseGroup = { id: string; title: string; primary_type: string | null; secondary_types: string[]; disambiguation: string };
export type ReleaseGroupWithInfo = ({ id: string; title: string; primary_type: string | null; secondary_types: string[]; disambiguation: string }) & { releases: Release[]; credit: Artist[]; cover_art: string | null };
export type ReleaseMedia = { track_count: number; format: string | null };
export type Release = { id: string; title: string };
export type ReleaseWithInfo = ({ id: string; title: string }) & { release_group: ReleaseGroup | null; media: ReleaseMedia[]; credit: Artist[]; cover_art: string | null };
export type Artist = { name: string; id: string; aliases: Alias[]; disambiguation: string; type: string | null; area: Area | null };
export type Area = { name: string; id: string };
export type Alias = { name: string; type: string | null };
export type Url = { id: string; url: string; type: string };
export type WithUrlRels<T> = { item: T; urls: Url[] };
export type SearchQuery = { type: "Search"; content: { query: string; page_size: number } } | { type: "Continuation"; content: SearchContinuation };
export type SearchContinuation = { query: string; offset: number; count: number; page_size: number };
export type SearchResults<T> = { items: T[]; continuation: SearchContinuation | null };
