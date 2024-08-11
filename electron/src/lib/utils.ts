import { toast } from "./toast/toast.ts";
import * as wasm from "$wasm/covau_app_wasm";

export type Keyed = { get_key(): unknown };

export interface Unique<T, K> {
    data: T;
    id: K;
}

export function exhausted(d: never) {
    console.log(d)
    throw new Error("unreachable: " + JSON.stringify(d));
}

export const fmt_time = (t: number) => {
    let hours = ("000" + Math.floor(t / 3600)).slice(-2);
    let mins = ("000" + Math.floor(t / 60)).slice(-2);
    let secs = ("000" + Math.floor(t % 60)).slice(-2);
    return `${Math.floor(t / 3600) ? hours + ":" : ""}${mins}:${secs}`;
};

export const err_msg = (e: any): string => {
    if (e instanceof Error) {
        return e.message;
    } else {
        return e.toString();
    }
}

export function wrap_toast(callback: (...items: any[]) => (Promise<void> | void)) {
    return async function(...items: any[]) {
        try {
            await callback(...items);
        } catch (e: any) {
            toast(err_msg(e), "error");
            console.error(e);
        }
    };
}

export function debounce(callback: () => Promise<void>, ms: number) {
    let timeout: number;
    return () => {
        clearTimeout(timeout);
        timeout = setTimeout(callback, ms) as unknown as number;
    };
}

export function buffer_concat(...arrays: Uint8Array[]) {
    let size = arrays.reduce((a, b) => a + b.byteLength, 0);
    let result = new Uint8Array(size);

    let offset = 0;
    for (let arr of arrays) {
        result.set(arr, offset);
        offset += arr.byteLength;
    }

    return result;
}

export async function stream_to_buffer(stream: ReadableStream<Uint8Array>) {
    let reader = stream.getReader();
    let data: Uint8Array[] = [];
    while (true) {
        let bytes = await reader.read();
        data.push((bytes.value ?? new Uint8Array()));
        if (bytes.done) {
            break;
        }
    }
    let bytes = buffer_concat(...data);
    return bytes;
}

export function buffer_to_base64(buf: Uint8Array): string {
    // get base64 stuff from rust compiled to wasm. this is incorrect for some reason.
    // return btoa(String.fromCharCode(...buf));

    return wasm.base64_encode(buf);
}

export function rem() {
    let rem = parseInt(getComputedStyle(document.documentElement).fontSize);
    return rem;
}
