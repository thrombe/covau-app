export type Message<T> = ({ type: "Ok"; content: T } | { type: "Err"; content: string }) & { id: number | null };
export type MessageResult<T> = { type: "Ok"; content: T } | { type: "Err"; content: string };
export type Request = { type: "Ping" };
export type PlayerCommand = { type: "Pause" } | { type: "Unpause" } | { type: "Play"; content: string } | { type: "SeekBy"; content: number } | { type: "SeekToPerc"; content: number } | { type: "Mute" } | { type: "Unmute" } | { type: "IsMuted" } | { type: "GetVolume" } | { type: "SetVolume"; content: number } | { type: "GetDuration" };
export type PlayerMessage = { type: "Paused" } | { type: "Unpaused" } | { type: "Finished" } | { type: "Playing"; content: string } | { type: "ProgressPerc"; content: number } | { type: "Volume"; content: number } | { type: "Duration"; content: number } | { type: "Mute"; content: boolean } | { type: "Error"; content: string };
export type FetchRequest = { url: string; body?: string | null; headers: string; method: string };
