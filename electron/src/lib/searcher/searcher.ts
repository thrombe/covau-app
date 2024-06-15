import type { ListItem } from "./item";

export interface Searcher {
    next_page(): Promise<ListItem[]>;
    has_next_page: boolean;
};
export let fused_searcher = {
    async next_page() { return [] },
    has_next_page: false,
};

export function StaticSearcher(items: ListItem[]) {
    return {
        async next_page() {
            return items;
        },
        has_next_page: false,
    } as Searcher;
}

