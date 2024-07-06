import type { ListItem, Option } from "./item.ts";
import type { Constructor } from "./mixins.ts";

export interface Searcher {
    next_page(): Promise<ListItem[]>;
    has_next_page: boolean;
    options(): Option[];
    items: ListItem[];
    handle_drop(item: ListItem, target: number, is_outsider: boolean): Promise<boolean>;
};
export type NewSearcher = ((q: string) => Promise<Searcher>) | ((q: string) => Searcher);
export let fused_searcher = {
    async next_page() { return [] },
    has_next_page: false,
    options: () => [],
};

export type SearcherConstructorMapper = (s: Constructor<Searcher>) => Constructor<Searcher>;

export function StaticSearcher(items: ListItem[]): Searcher {
    return {
        async next_page() {
            return items;
        },
        async handle_drop(_item: ListItem, _target: number, _is_outsider: boolean) {
            return false;
        },
        options: () => [],
        has_next_page: false,
        items: items,
    };
}

