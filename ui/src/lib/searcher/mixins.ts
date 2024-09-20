import { type Keyed } from "$lib/utils.ts";
import type { ListItem, Option } from "./item.ts";
import type { Searcher } from "./searcher.ts";
import * as stores from "$lib/stores.ts";
import { Mutex } from 'async-mutex';
import { imports } from "$lib/cyclic.ts";

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

export function RearrangeWrapper<T>(
    items: T[],
    mapper: (t: T, index: number) => ListItem,
    on_update: (items: T[]) => Promise<void>,
    // on_insert: (item: ListItem) => Promise<T | null> = async () => { return null; },
) {
    let self = {
        items: items.map(mapper),
        has_next_page: true,
        options() {
            return [] as Option[];
        },
        get_item_index(item: ListItem) {
            for (let i = 0; i < this.items.length; i++) {
                if (this.items[i].get_key() == item.get_key()) {
                    return i;
                }
            }
            return null;
        },
        move(from: number, to: number) {
            if (from < to) {
                items.splice(to + 1, 0, items[from]);
                items.splice(from, 1);
            } else {
                items.splice(to, 0, items[from]);
                items.splice(from + 1, 1);
            }
        },
        async remove_item(item: ListItem) {
            let index = this.get_item_index(item);
            if (index) {
                let item = items[index];
                items.splice(index, 1);
                await on_update(items);
                stores.update_current_tab();
                return item;
            }
            return null;
        },
        // async insert(index: number, item: ListItem) {
        //     if (this.get_item_index(item) != null) {
        //         throw new Error(`item "${item.title()}" already in list`);
        //     }
        //     let insert_item = await on_insert(item);
        //     if (insert_item != null) {
        //         items.splice(index, 0, );
        //         await on_update(items);
        //         stores.update_current_tab();
        //     }
        // },
        async move_item(item: ListItem, to: number) {
            let index = this.get_item_index(item);
            if (index != null) {
                this.move(index, to);
                if (index != to) {
                    await on_update(items);
                    stores.update_current_tab();
                }
            } else {
                throw new Error(`item "${item.title()}" not in list`);
            }
        },
        async handle_drop(item: ListItem, target: number | null, is_outsider: boolean): Promise<boolean> {
            if (is_outsider) {
                if (target == null) {
                    target = this.items.length;
                }
                // TODO: inserting not supported yet
                return false;
            } else {
                if (target == null) {
                    target = this.items.length - 1;
                }
                await this.move_item(item, target);
            }

            return true;
        },
        async next_page() {
            this.has_next_page = false;
            this.items = items.map(mapper);
            return this.items;
        },
    };
    return self as typeof self & Searcher;
}

export interface ISlow<T, Q> {
    search_query(q: Q): Promise<T | null>;
}
export function SlowSearch<T, Q, S extends Constructor<{
    search_query(q: Q): Promise<T | null>;
}>>(s: S) {
    return class SlowSearch extends s implements ISlow<T, Q> {
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

export interface IDropWrapper {
    handle_drop(item: ListItem, target: number, is_outsider: boolean): Promise<boolean>;
    remove(item: ListItem): Promise<number | null>;
}
export function DropWrapper<S extends Constructor<{
    items: ListItem[];
}>>(s: S, d: ListItem | null) {
    return class DropWrapper extends s implements IDropWrapper {
        get_item_index(item: ListItem) {
            for (let i = 0; i < this.items.length; i++) {
                if (this.items[i].get_key() == item.get_key()) {
                    return i;
                }
            }
            return null;
        }
        move(from: number, to: number) {
            if (from < to) {
                this.items.splice(to + 1, 0, this.items[from]);
                this.items.splice(from, 1);
            } else {
                this.items.splice(to, 0, this.items[from]);
                this.items.splice(from + 1, 1);
            }
        }
        insert(index: number, item: ListItem) {
            if (this.get_item_index(item) != null) {
                throw new Error(`item "${item.title()}" already in list`);
            }
            this.items.splice(index, 0, item);
        }
        move_item(item: ListItem, to: number) {
            let index = this.get_item_index(item);
            if (index != null) {
                this.move(index, to);
            } else {
                throw new Error(`item "${item.title()}" not in list`);
            }
        }

        async remove(item: ListItem): Promise<number | null> {
            if (d == null) {
                return null;
            }

            let index = await d.remove(item);
            if (index == null) {
                return null;
            }

            this.items.splice(index, 1);
            return index;
        }

        async handle_drop(item: ListItem, target: number | null, is_outsider: boolean): Promise<boolean> {
            if (d == null) {
                return false;
            }

            if (is_outsider) {
                if (target == null) {
                    target = this.items.length;
                }
            } else {
                if (target == null) {
                    target = this.items.length - 1;
                }
            }

            let handled = await d.handle_drop(item, target, is_outsider);
            if (!handled) {
                return false;
            }

            if (is_outsider) {
                this.insert(target, item);
            } else {
                this.move_item(item, target);
            }

            imports.stores.update_current_tab();

            return true;
        }
    } as S & Constructor<IDropWrapper>;
}

export interface IDebounceWrapper<T> {
    next_page(): Promise<T[]>;
};
export function DebounceWrapper<T, S extends Constructor<{
    next_page(): Promise<T[]>;
}>>(s: S) {
    return class DebounceWrapper extends s implements IDebounceWrapper<T> {
        promise: Promise<T[]> = Promise.resolve([]);
        is_resolved = true;
        override async next_page(): Promise<T[]> {
            if (this.is_resolved) {
                this.is_resolved = false;
                this.promise = this.promise.then(async (_) => {
                    let items = await super.next_page();
                    this.is_resolved = true;
                    return items;
                });
            }
            let res = await this.promise;
            return res;
        }
    } as S & Constructor<IDebounceWrapper<T>>;
}

export interface IMapWrapper { };
export function MapWrapper(mapper: (item: ListItem) => Promise<ListItem>) {
    return <S extends Constructor<Searcher>>(s: S) => class MapWrapper extends s implements IMapWrapper {
        override async next_page(): Promise<ListItem[]> {
            let res = await super.next_page();
            let items = await Promise.all(res.map(e => mapper(e)));
            return items;
        }
    } as IMapWrapper & S;
}

export interface IOptionsWrapper { };
export function OptionsWrapper<S extends Constructor<Searcher>>(fn: (old: Option[], s: Searcher) => Option[]) {
    return (s: S) => class OptionsWrapper extends s implements IOptionsWrapper {
        options() {
            let old = super.options();
            let new_ops = fn(old, this);
            return new_ops;
        }
    } as IOptionsWrapper & S;
}

export interface ISaved<T> {
    next_page(): Promise<(T & Keyed)[]>;

    items: (T & Keyed)[];
}
export function SavedSearch<T, S extends Constructor<{
    next_page(): Promise<(T & Keyed)[]>;
}>>(s: S) {
    return class SavedSearch extends s implements ISaved<T> {
        items: Array<(T & Keyed)>;
        saved_search_mutex = new Mutex();

        constructor(...args: any[]) {
            super(...args);
            this.items = new Array();
        }

        override async next_page() {
            return await this.saved_search_mutex.runExclusive(async () => {
                let items = await super.next_page();
                this.items.push(...items);
                return this.items;
            });
        }
    } as S & Constructor<ISaved<T>>
}


export interface IUnique<T> {
    next_page(): Promise<T[]>;
}
export function UniqueSearch<T extends Keyed, S extends Constructor<{
    next_page(): Promise<T[]>;
}>>(s: S) {
    return class UniqueWrapper extends s implements IUnique<T> {
        uniq: Set<T>;
        constructor(...args: any[]) {
            super(...args);
            this.uniq = new Set();
        }

        override async next_page() {
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
        if (!this.has_next_page) {
            return new Array<(T & Keyed)>();
        }
        let r = await this.search(this.curr_offset);
        this.curr_offset += r.length;
        return r;
    }
}
