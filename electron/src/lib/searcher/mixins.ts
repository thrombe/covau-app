import { type Keyed } from "$lib/virtual.ts";
import type { ListItem, Option } from "./item";
import type { Searcher } from "./searcher";

export type Constructor<T> = new (...args: any[]) => T;

// type NonFunctionPropertyNames<T> = {
//     [K in keyof T]: T[K] extends Function ? never : K;
// }[keyof T];
// type FunctionPropertyNames<T> = {
//     [K in keyof T]: T[K] extends Function ? K : never;
// }[keyof T];
// type NonFunctionProperties<T> = Pick<T, NonFunctionPropertyNames<T>>;
// type FunctionProperties<T> = Pick<T, FunctionPropertyNames<T>>;
// type ExcludeMethods<T> =
//     { [K in keyof T as (T[K] extends Function ? never : K)]: T[K] }
// type PickMatching<T, V> =
//     { [K in keyof T as T[K] extends V ? K : never]: T[K] }
// type ExtractMethods<T> = PickMatching<T, Function>;


export const sleep = (ms: number) => {
    return new Promise(
        (r) => setTimeout(r, ms)
    )
};


export interface ISlow<T, Q> {
    search_query(q: Q): Promise<T | null>;
}
export function SlowSearch<T, Q, S extends Constructor<{
    search_query(q: Q): Promise<T | null>;
}>>(s: S) {
    return class extends s implements ISlow<T, Q> {
        last_search: number = 0;
        search_generation: number = 0;
        async search_query(q: Q) {
            this.search_generation += 1;
            let current_generation = this.search_generation;
            let del = 500;
            let now = Date.now();
            if (now - this.last_search < del) {
                await sleep(del);
            }

            // some other (concurrent) call to this method may change current_generation
            if (this.search_generation == current_generation) {
                this.last_search = Date.now();
                let r = await super.search_query(q);

                // to make sure that latest searches are not overwritten by searches that started earlier
                if (this.search_generation == current_generation) {
                    return r;
                }
            }
            return null;
        }
    } as S & Constructor<ISlow<T, Q>>
}


export interface IAsyncWrapper<T> {
    next_page(): Promise<T[]>;
};
export function AsyncWrapper<T, S extends Constructor<{
    next_page(): Promise<T[]>;
}>>(s: S) {
    return class extends s implements IAsyncWrapper<T> {
        promise: Promise<T[]> | null = null;
        async next_page(): Promise<T[]> {
            if (!this.promise) {
                this.promise = super.next_page();
            }
            let res = await this.promise;
            this.promise = null;
            return res;
        }
    } as S & Constructor<IAsyncWrapper<T>>;
}

export interface IMapWrapper { };
export function MapWrapper<S extends Constructor<Searcher>>(mapper: (item: ListItem) => Promise<ListItem>) {
    return (s: S) => class extends s implements IMapWrapper {
        async next_page(): Promise<ListItem[]> {
            let res = await super.next_page();
            let items = await Promise.all(res.map(e => mapper(e)));
            return items;
        }
    } as IMapWrapper & S;
}

export interface IOptionsWrapper { };
export function OptionsWrapper<S extends Constructor<Searcher>>(fn: (old: Option[], s: Searcher) => Option[]) {
    return (s: S) => class extends s implements IOptionsWrapper {
        options() {
            let old = super.options();
            let new_ops = fn(old, this);
            return new_ops;
        }
    } as IOptionsWrapper & S;
}

export interface ISaved<T> {
    next_page(): Promise<(T & Keyed)[]>;

    search_results: (T & Keyed)[];
}
export function SavedSearch<T, S extends Constructor<{
    next_page(): Promise<(T & Keyed)[]>;
}>>(s: S) {
    return class extends s implements ISaved<T> {
        search_results: Array<(T & Keyed)>;

        // this essentially acts as an async semaphore
        last_op: Promise<(T & Keyed)[]>;

        constructor(...args: any[]) {
            super(...args);
            this.search_results = new Array();
            this.last_op = Promise.resolve([]);
        }

        override next_page = async () => {
            await this.last_op;
            this.last_op = super.next_page();
            let r = await this.last_op;
            this.search_results.push(...r);
            return this.search_results;
        }
    } as S & Constructor<ISaved<T>>
}


export interface IUnique<T> {
    next_page(): Promise<T[]>;
}
export function UniqueSearch<T extends Keyed, S extends Constructor<{
    next_page(): Promise<T[]>;
}>>(s: S) {
    return class extends s implements IUnique<T> {
        uniq: Set<T>;
        constructor(...args: any[]) {
            super(...args);
            this.uniq = new Set();
        }

        async next_page() {
            let r = await super.next_page();
            let items = r.filter((item) => {
                let k: any = item.get_key();
                if (this.uniq.has(k)) {
                    return false;
                } else {
                    this.uniq.add(k);
                    return true;
                }
            });
            return items;
        }
    } as S & Constructor<IUnique<T>>
}



export abstract class Paged<T> {
    next_page_num: number = 0;
    has_next_page: boolean = true;
    query: string;
    constructor(q: string) {
        this.query = q;
    }

    // implementor must set has_next_page
    protected abstract search(page: number): Promise<(T & Keyed)[]>;
    abstract get_key(t: (T & Keyed)): unknown;

    async next_page() {
        // TODO: if this function is called multiple times really quickly, this has_next_page check fails as previous calls are still awaiting for io
        if (!this.has_next_page) {
            return new Array<(T & Keyed)>();
        }
        let r = await this.search(this.next_page_num);
        this.next_page_num += 1;
        return r;
    }
}


export abstract class Unpaged<T> {
    has_next_page: boolean = true;

    abstract next_page(): Promise<(T & Keyed)[]>;
}


export abstract class Offset<T> {
    curr_offset: number = 0;
    has_next_page: boolean = true;
    query: string;
    constructor(q: string) {
        this.query = q;
    }

    // implementor must set has_next_page
    protected abstract search(page: number): Promise<(T & Keyed)[]>;
    abstract get_key(t: (T & Keyed)): unknown;

    async next_page() {
        // TODO: if this function is called multiple times really quickly, this has_next_page check fails as previous calls are still awaiting for io
        if (!this.has_next_page) {
            return new Array<(T & Keyed)>();
        }
        let r = await this.search(this.curr_offset);
        this.curr_offset += r.length;
        return r;
    }
}


