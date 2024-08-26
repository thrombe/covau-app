import type { ListItem, Option } from "./item.ts";
import * as mixins from "./mixins.ts";

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

export type SearcherConstructorMapper = (s: mixins.Constructor<Searcher>) => mixins.Constructor<Searcher>;

export function StaticSearcher(items: ListItem[], drop_handle: ListItem | null = null): Searcher {
    class StaticSearcher {
        has_next_page = false;
        items: ListItem[];

        constructor(items: ListItem[]) {
            this.items = items.map(t => {
                // @ts-ignore
                t.searcher = this;
                return t;
            });
        }

        async next_page() {
            return items;
        }
        options() {
            return [];
        }
    };

    const DW = mixins.DropWrapper(StaticSearcher, drop_handle);
    return new DW(items);
}

export function AsyncStaticSearcher(get_items: () => Promise<ListItem[]>, drop_handle: ListItem | null = null): Searcher {
    class AsyncStaticSearcher {
        has_next_page = false;
        items = [] as ListItem[];

        got_items = false;
        async next_page() {
            if (!this.got_items) {
                let items = await get_items();
                this.items = items.map(t => {
                    // @ts-ignore
                    t.searcher = this;
                    return t;
                });
                this.got_items = true;
            }
            return this.items;
        }
        options() {
            return [];
        }
    };

    const DW = mixins.DropWrapper(AsyncStaticSearcher, drop_handle);
    return new DW();
}

