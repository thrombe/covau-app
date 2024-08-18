import type { ListItem, Option } from "./item.ts";
import type { Constructor } from "./mixins.ts";

export interface Searcher {
    next_page(): Promise<ListItem[]>;
    has_next_page: boolean;
    options(): Option[];
    items: ListItem[];
    handle_drop(item: ListItem, target: number, is_outsider: boolean): Promise<boolean>;
    remove(item: ListItem): Promise<number | null>;
};
export type NewSearcher = ((q: string) => Promise<Searcher>) | ((q: string) => Searcher);
export let fused_searcher: Searcher = {
    async next_page(): Promise<ListItem[]> { return [] },
    has_next_page: false,
    options: () => [],
    handle_drop: () => Promise.resolve(false),
    remove: () => Promise.resolve(null),
    items: [] as ListItem[],
};

export type SearcherConstructorMapper = (s: Constructor<Searcher>) => Constructor<Searcher>;

export function StaticSearcher(items: ListItem[]): Searcher {
    return {
        async next_page() {
            return items;
        },
        async handle_drop() {
            return false;
        },
        async remove() {
            return null;
        },
        options: () => [],
        has_next_page: false,
        items: items,
    };
}

export function AsyncStaticSearcher(get_items: () => Promise<ListItem[]>): Searcher {
    let s = {
        got_items: false,
        async next_page() {
            if (!this.got_items) {
                this.items = await get_items();
                this.got_items = true;
            }
            return this.items;
        },
        async handle_drop() {
            return false;
        },
        async remove() {
            return null;
        },
        options: () => [],
        has_next_page: false,
        items: [] as ListItem[],
    };
    return s as Searcher;
}

