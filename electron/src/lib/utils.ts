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

// - [object deep freeze typescript](https://stackoverflow.com/a/59338545)
export type DRo<T> =
    T extends (infer R)[]
    ? ReadonlyArray<DRo<R>>
    
    : T extends Function
    ? T
    
    : T extends object
    ? { readonly [P in keyof T]: DRo<T[P]>; }
    
    : T;

export type NoDRo<T> =
    T extends (infer R)[]
    ? NoDRo<R>[]
    
    : T extends Function
    ? T
    
    : T extends Object
    ? { -readonly [P in keyof T]: NoDRo<T[P]>; }
    
    : T;

export function deep_freeze<T extends Object>(obj: T): DRo<T> {
    Object.keys(obj).forEach((prop: string) => {

        if (typeof obj[prop as keyof T] === "object"
            && obj[prop as keyof T] !== null &&
            !Object.isFrozen(obj[prop as keyof T])) {

            // @ts-ignore
            deep_freeze(obj[prop]);
        }
    });
    return Object.freeze(obj) as DRo<T>;
}
// export function deep_freeze<T extends object>(obj: T) {
//   Object.keys(obj).forEach((prop) => {
//     if (
//       typeof obj[prop as keyof T] === 'object' &&
//       !Object.isFrozen(obj[prop as keyof T])
//     ) {
//       deep_freeze(obj[prop as keyof T]);
//     }
//   });
//   return Object.freeze(obj);
// };
// export function deep_freeze<T>(source: T, freezeParent = true): DRo<T> {
//     console.log(JSON.stringify(source));
//     if (freezeParent) {
//         Object.freeze(source);
//     }

//     Object.getOwnPropertyNames(source).forEach(prop => {
//         if (
//             Object.prototype.hasOwnProperty.call(source as any, prop) &&
//             (source as any)[prop] !== null &&
//             (typeof (source as any)[prop] === 'object' || typeof (source as any)[prop] === 'function')
//         ) {
//             if (Object.isFrozen((source as any)[prop])) {
//                 deep_freeze((source as any)[prop], false);
//             } else {
//                 deep_freeze((source as any)[prop], true);
//             }
//         }
//     })

//     return source as DRo<T>
// }

export function clone<T>(t: T): NoDRo<T> {
    return structuredClone(t) as NoDRo<T>;
}

export function maybe<T, P>(t: T | null, fn: (t: T) => P) {
    let non_null = [t].filter(n => n != null) as T[];
    return non_null.map(n => fn(n));
}
