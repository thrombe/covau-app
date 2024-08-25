import type { DbMetadata, DbItem, Typ, SearchQuery } from '$types/db.ts';

export type Message<T> = ({ type: "Request"; content: T } | { type: "OkOne"; content: T } | { type: "OkMany"; content: { data: T; done: boolean; index: number } } | { type: "Err"; content: ErrorMessage }) & { id: number | null };
export type MessageResult<T> = { type: "Request"; content: T } | { type: "OkOne"; content: T } | { type: "OkMany"; content: { data: T; done: boolean; index: number } } | { type: "Err"; content: ErrorMessage };
export type FeRequest = { type: "Like" } | { type: "Dislike" } | { type: "Next" } | { type: "Prev" } | { type: "Pause" } | { type: "Play" } | { type: "Repeat" } | { type: "ToggleMute" } | { type: "TogglePlay" } | { type: "BlacklistArtists" } | { type: "RemoveAndNext" } | { type: "SeekFwd" } | { type: "SeekBkwd" } | { type: "Notify"; content: string } | { type: "NotifyError"; content: string };
export type AppMessage = "Online" | "Offline" | "Load" | "Unload" | "Visible" | "NotVisible";
export type PlayerCommand = { type: "Pause" } | { type: "Unpause" } | { type: "Play"; content: string } | { type: "SeekBy"; content: number } | { type: "SeekToPerc"; content: number } | { type: "Mute" } | { type: "Unmute" } | { type: "IsMuted" } | { type: "GetVolume" } | { type: "SetVolume"; content: number } | { type: "GetDuration" };
export type PlayerMessage = { type: "Paused" } | { type: "Unpaused" } | { type: "Finished" } | { type: "Playing"; content: string } | { type: "ProgressPerc"; content: number } | { type: "Volume"; content: number } | { type: "Duration"; content: number } | { type: "Mute"; content: boolean } | { type: "Error"; content: string };
export type ProxyRequest = { url: string; body?: string | null; headers: string; method: string };
export type InsertResponse<T> = { type: "New"; content: T } | { type: "Old"; content: T };
export type YtStreamQuery = { size: number; id: string };
export type ImageQuery = { src: string };
export type DbRequest = { type: "NewId" } | { type: "Begin" } | { type: "Commit"; content: number } | { type: "Rollback"; content: number } | { type: "Insert"; content: { transaction_id: number; typ: Typ; item: string } } | { type: "InsertOrGet"; content: { transaction_id: number; typ: Typ; item: string } } | { type: "Update"; content: { transaction_id: number; item: DbItem<string> } } | { type: "UpdateMetadata"; content: { transaction_id: number; id: number; typ: Typ; metadata: DbMetadata } } | { type: "Delete"; content: { transaction_id: number; item: DbItem<string> } } | { type: "Search"; content: { typ: Typ; query: SearchQuery } } | { type: "GetByRefid"; content: { typ: Typ; refid: string } } | { type: "GetManyByRefid"; content: { typ: Typ; refids: string[] } } | { type: "GetById"; content: { typ: Typ; id: number } } | { type: "GetManyById"; content: { typ: Typ; ids: number[] } } | { type: "GetUntypedById"; content: { id: number } } | { type: "GetManyUntypedById"; content: { ids: number[] } };
export type ErrorMessage = { message: string; stack_trace: string };