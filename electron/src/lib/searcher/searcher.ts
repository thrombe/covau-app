import type { ListItem, Option } from "./item.ts";
import type { Constructor } from "./mixins.ts";

export interface Searcher {
    next_page(): Promise<ListItem[]>;
    has_next_page: boolean;
    options(): Option[];
};
export let fused_searcher = {
    async next_page() { return [] },
    has_next_page: false,
    options: () => [],
};

export type SearcherConstructorMapper = (s: Constructor<Searcher>) => Constructor<Searcher>;

export function StaticSearcher(items: ListItem[]) {
    return {
        async next_page() {
            return items;
        },
        has_next_page: false,
    } as Searcher;
}

