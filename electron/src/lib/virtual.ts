
export type Keyed = { get_key(): unknown };

export interface Unique<T, K> {
    data: T;
    id: K;
}

export function exhausted(d: never) {
    console.log(d)
    throw new Error("unreachable");
}

