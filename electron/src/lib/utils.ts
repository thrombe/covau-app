import { toast } from "./toast/toast.ts";

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

