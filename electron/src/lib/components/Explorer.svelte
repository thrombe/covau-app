<script lang="ts">
    import type { ListItem } from "$lib/searcher/item.ts";
    import VirtualScrollable from "./VirtualScrollable.svelte";
    import { onDestroy, tick } from "svelte";
    import { type Unique } from "../virtual.ts";
    import { get, readable, type Readable } from "svelte/store";
    import type { Searcher } from "$lib/searcher/searcher.ts";
    import * as stores from "$lib/stores.ts";
    import { toast } from "$lib/toast/toast.ts";

    export let searcher: Readable<Searcher>;
    export let columns: number;
    export let item_height: number;
    export let end_is_visible = true;
    export let updater: Readable<number>;
    export let source_key: number;
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
            index: number;
            item_width: number;
            item_height: number;
            selected: boolean;
            root: HTMLElement;
            info_margin: number;
            info_width: number;
            hovering: number | null;
            dragging_index: number | null;
            dragstart: (index: number, t: ListItem) => void;
            dragenter: (index: number) => Promise<void>;
        };
        infobox: {};
    }

    export let selected_item: Unique<ListItem, unknown> =
        undefined as unknown as Unique<ListItem, unknown>;
    let selected_item_index: number;
    let items = new Array<Unique<ListItem, number>>();

    let hovering: number | null = null;
    let dragging_index: number | null = null;
    const dragstart = (index: number, t: ListItem) => {
        dragging_index = index;
        stores.drag_item.set({
            source_key: source_key,
            item: t,
        });
    };
    const dragenter = async (index: number) => {
        if (get(stores.drag_item) == null) {
            return;
        }
        hovering = index;
        await stores.drag_ops.set_source({
            source_key: source_key,
            drop_callback: async () => {
                let item = get(stores.drag_item);
                if (!item) {
                    return;
                }

                try {
                    let handled = await get(searcher).handle_drop(item.item, index, item.source_key != source_key);
                    if (!handled) {
                        toast("could not handle this drop", "error");
                    }
                } catch (e: any) {
                    if (e instanceof Error) {
                        toast(e.message, "error")
                    } else {
                        toast(e.toString(), "error")
                    }
                }
            },
            drop_cleanup: async () => {
                dragging_index = null;
                hovering = null;
            },
        });
    };

    const _end_reached = async (s: Readable<Searcher>) => {
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

    let is_resolved = true;
    let promise = Promise.resolve();
    const end_reached = async (s: Readable<Searcher> = searcher) => {
        if (is_resolved) {
            is_resolved = false;
            promise = promise.then(async () => {
                await _end_reached(s);
                is_resolved = true;
            });
            await promise;
        } else {
            await promise;
        }
    };
    const next_page = async (s: Readable<Searcher>) => {
        let r = await get(s).next_page();
        items = r.map((e) => {
            return { id: e.get_key(), data: e } as Unique<ListItem, number>;
        });
    };
    let unsub = searcher.subscribe(async (s) => {
        selected_item_index = 0;
        is_resolved = true;
        if (end_is_visible) {
            items = [];
            await end_reached(readable(s));
        } else {
            items = [];
        }
    });
    onDestroy(unsub);

    unsub = updater.subscribe(async _ => {
        await next_page(searcher);
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
            let:index
            let:selected
        >
            <slot
                {index}
                {item}
                {item_width}
                {item_height}
                {selected}
                {root}
                {info_margin}
                {info_width}
                {hovering}
                {dragging_index}
                {dragstart}
                {dragenter}
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
