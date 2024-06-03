export type Recording = { title: string; id: string; releases: Release[] };
export type ReleaseGroup = { id: string; title: string; primary_type: string; secondary_types: string[]; disambiguation: string };
export type ReleaseGroupWithInfo = ({ id: string; title: string; primary_type: string; secondary_types: string[]; disambiguation: string }) & { releases: Release[]; credit: Artist[] };
export type ReleaseMedia = { track_count: number; format: string | null };
export type Release = { id: string; title: string };
export type ReleaseWithInfo = ({ id: string; title: string }) & { release_group: ReleaseGroup | null; media: ReleaseMedia[]; credit: Artist[] };
export type Artist = { name: string; id: string; aliases: Alias[]; disambiguation: string; type: string | null; area: Area | null };
export type Area = { name: string; id: string };
export type Alias = { name: string; type: string };
export type Url = { id: string; url: string; type: string };
