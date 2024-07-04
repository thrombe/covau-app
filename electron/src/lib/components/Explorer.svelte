<script lang="ts">
    import type { ListItem } from "$lib/searcher/item.ts";
    import VirtualScrollable from "./VirtualScrollable.svelte";
    import { onDestroy, tick } from "svelte";
    import type { Unique } from "../virtual.ts";
    import { get, readable, type Readable } from "svelte/store";
    import type { Searcher } from "$lib/searcher/searcher.ts";

    export let searcher: Readable<Searcher>;
    export let columns: number;
    export let item_height: number;
    export let end_is_visible = true;
    export let on_item_click: (
        t: Unique<ListItem, unknown>
    ) => Promise<void> = async (t) => {
        console.log(t);
    };
    export let try_scroll_selected_item_in_view: () => Promise<void> =
        async () => {};
    export let keyboard_control = true;

    interface $$Slots {
        default: {
            item: ListItem;
            item_width: number;
            item_height: number;
            selected: boolean;
            root: HTMLElement;
            info_margin: number;
            info_width: number;
        };
        infobox: {};
    }

    export let selected_item: Unique<ListItem, unknown> =
        undefined as unknown as Unique<ListItem, unknown>;
    let selected_item_index: number;
    let items = new Array<Unique<ListItem, number>>();

    const end_reached = async (s: Readable<Searcher> = searcher) => {
        while (true) {
            if (!end_is_visible || !get(s).has_next_page) {
                break;
            }
            await next_page(s);
            await tick();
            await new Promise<void>((r) => setTimeout(() => r(), 100));
            await tick();
        }
    };
    const next_page = async (s: Readable<Searcher>) => {
        let r = await get(s).next_page();
        items = r.map((e) => {
            return { id: e.get_key(), data: e } as Unique<ListItem, number>;
        });
    };
    export const search_objects = async (s: Readable<Searcher>) => {
        await next_page(s);
        await tick();
        selected_item_index = 0;
        await try_scroll_selected_item_in_view();
        end_reached(s);
    };
    let unsub = searcher.subscribe(async (s) => {
        items = [];
        if (search_objects) {
            await search_objects(readable(s));
        }
    });
    onDestroy(unsub);

    let info_width = 0;
    let info_margin = 0;
    let show_item_info = false;
    $: if (show_item_info) {
        info_width = 350;
        info_margin = 20;
    } else {
        info_width = 0;
        info_margin = 0;
    }
</script>

<cl
    class="main"
    style="--info-width: {info_width}px; --info-margin: {info_margin}px;"
>
    <scrollable>
        <VirtualScrollable
            bind:items
            {columns}
            {item_height}
            {on_item_click}
            {end_reached}
            {keyboard_control}
            bind:try_scroll_into_view={try_scroll_selected_item_in_view}
            bind:selected={selected_item_index}
            bind:end_is_visible
            bind:selected_item
            let:item_width
            let:item_height
            let:root
            let:item
            let:selected
        >
            <slot
                {item}
                {item_width}
                {item_height}
                {selected}
                {root}
                {info_margin}
                {info_width}
            />
        </VirtualScrollable>
    </scrollable>

    {#if selected_item && show_item_info}
        <slot name="infobox" />
    {/if}
</cl>

<style>
    .main {
        width: 100%;
        height: 100%;

        flex-direction: column;
    }

    cl {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        width: 100%;
    }

    scrollable {
        width: calc(100% - var(--info-width));
        height: 100%;
    }
</style>
