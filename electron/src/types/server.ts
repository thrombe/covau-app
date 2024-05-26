export type Message = { type: "Ping" };
export type PlayerCommand = { type: "Pause" } | { type: "Unpause" } | { type: "Play"; content: string } | { type: "SeekBy"; content: number } | { type: "SeekToPerc"; content: number } | { type: "GetVolume" } | { type: "SetVolume"; content: number } | { type: "GetDuration" };
export type PlayerMessage = { type: "Paused" } | { type: "Unpaused" } | { type: "Finished" } | { type: "Playing"; content: string } | { type: "ProgressPerc"; content: number } | { type: "Volume"; content: number } | { type: "Duration"; content: number };
export type FetchRequest = { url: string; body?: string | null; headers: string; method: string };
