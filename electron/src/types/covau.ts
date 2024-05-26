export type Source = { type: "File"; content: string } | { type: "YtId"; content: string };
export type Artist = { name: string };
export type Song = { title: string; mbz_id: string | null; sources: Source[] };
