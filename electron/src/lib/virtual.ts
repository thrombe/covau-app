
export interface Unique<T, K> {
    data: T;
    id: K;
}

export function exhausted(_: never) {
    throw "unreachable";
}

