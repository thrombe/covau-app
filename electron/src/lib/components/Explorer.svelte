<script lang="ts">
    import type { ListItem } from "$lib/searcher/item.ts";
    import VirtualScrollable from "./VirtualScrollable.svelte";
    import { onDestroy, tick } from "svelte";
    import type { Unique } from "../virtual.ts";
    import type { Readable } from "svelte/store";
    import * as stores from "$lib/stores.ts";

    export let searcher: Readable<stores.Searcher>;
    export let selected_item_index: number;
    export let selected_item: Unique<ListItem, unknown>;
    export let columns: number;
    export let item_height: number;
    export let end_is_visible = true;
    export let on_item_click: (t: Unique<ListItem, unknown>) => Promise<void>;
    export let try_scroll_selected_item_in_view: () => Promise<void>;
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

    let items = new Array<Unique<ListItem, number>>();

    const end_reached = async () => {
        while (true) {
            if (!end_is_visible || !$searcher.has_next_page) {
                break;
            }
            await next_page();
            await tick();
            await new Promise<void>((r) => setTimeout(() => r(), 100));
            await tick();
        }
    };
    const next_page = async () => {
        let r = await $searcher.next_page();
        items = r.map((e) => {
            return { id: e.key(), data: e } as Unique<ListItem, number>;
        });
    };
    export const search_objects = async () => {
        await next_page();
        await tick();
        selected_item_index = 0;
        await try_scroll_selected_item_in_view();
        end_reached();
    };
    let unsub = searcher.subscribe(async (_) => {
        items = [];
        if (search_objects) {
            await search_objects();
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
