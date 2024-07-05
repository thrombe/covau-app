<script lang="ts" context="module">
    let selected_item_index: number;
</script>

<script lang="ts">
    import AudioListItem from "$lib/components/AudioListItem.svelte";
    import type { ListItem } from "$lib/searcher/item.ts";
    import { onDestroy, tick } from "svelte";
    import type { Unique } from "../virtual";
    import VirtualScrollable from "$lib/components/VirtualScrollable.svelte";
    import * as stores from "$lib/stores.ts";
    import { type QueueManager } from "./queue.ts";
    import { get, readable, type Readable, type Writable } from "svelte/store";
    import ThreeDotMenu from "$lib/components/ThreeDotMenu.svelte";
    import * as icons from "$lib/icons.ts";

    export let item_height: number;
    let items: Unique<ListItem, string>[] = [];
    export let mobile = false;

    let queue = stores.queue as Writable<QueueManager>;

    let hovering: number | null = null;
    let dragging_index: number | null = null;
    let drag_source_key = stores.new_key();
    const dragstart = (index: number, t: ListItem) => {
        dragging_index = index;
        stores.drag_item.set({
            source_key: drag_source_key,
            item: t,
        });
    };
    const dragenter = (index: number) => {
        hovering = index;
        stores.drag_ops.set_source({
            source_key: drag_source_key,
            drop_callback: () => {
                let item = get(stores.drag_item);
                if (!item) {
                    return;
                }

                if (!item.item.is_playable()) {
                    return;
                }

                let q = get(queue);
                if (item.source_key == drag_source_key) {
                    q.move_queue_item(item.item, index);
                } else {
                    q.insert(index, item.item);
                }
                queue.update(t => t);
            },
            drop_cleanup: () => {
                dragging_index = null;
                hovering = null;
            },
        });
    };

    let playing: number | null = null;
    let options = $queue.options();

    let unsub = queue.subscribe((q) => {
        playing = q.playing_index;
        options = q.options();
    });
    onDestroy(unsub);

    let end_is_visible = false;
    const end_reached = async (q: Readable<QueueManager> = queue) => {
        while (true) {
            if (!end_is_visible || !$queue.has_next_page) {
                break;
            }
            await next_page(q);
            await tick();
            await new Promise<void>((r) => setTimeout(() => r(), 100));
            await tick();
        }
    };
    const next_page = async (q: Readable<QueueManager>) => {
        let r = await get(q).next_page();
        items = r.map((e) => ({ id: e.get_key(), data: e })) as typeof items;
    };
    export const search_objects = async (q: Readable<QueueManager> = queue) => {
        await next_page(q);
        await tick();
        selected_item_index = 0;
        await try_scroll_selected_item_in_view();
        end_reached(q);
    };

    unsub = queue.subscribe(async (q) => {
        if (search_objects) {
            await search_objects(readable(q));
        }
    });
    onDestroy(unsub);

    const on_item_click = async (_: Unique<ListItem, unknown>) => {};
    let selected_item: Unique<ListItem, unknown>;
    let try_scroll_selected_item_in_view: () => Promise<void>;
</script>

<div class="flex flex-col h-full w-full">
    <div class="{mobile ? '' : 'p-2 pl-0'} h-16">
        <div class="flex flex-row h-full {mobile ? 'py-2 bg-gray-900 bg-opacity-30' : 'rounded-xl bg-gray-400 bg-opacity-20'}">
            <div class="h-full pl-2 pr-2 flex-grow">
                <div
                    class="h-full w-full text-center flex flex-col justify-center text-gray-200 text-xl font-bold"
                >
                    Queue
                </div>
                <!-- <InputBar
                    placeholder={"Queue"}
                    value={""}
                    on_enter={async () => {}}
                /> -->
            </div>

            <div
                class="my-2 mr-2 p-1 aspect-square relative"
                class:hidden={options.length == 0}
            >
                <ThreeDotMenu {options} let:on_menu_click let:show_menu>
                    <button
                        class="w-full h-full"
                        on:click={on_menu_click}
                        class:menu-open={show_menu}
                    >
                        <img
                            class="w-full h-full opacity-75"
                            alt="three dot menu icon"
                            src={icons.three_dot_menu}
                        />
                    </button>
                </ThreeDotMenu>
            </div>
        </div>
    </div>
    <div class="w-full" style="height: calc(100% - 4rem);">
        <VirtualScrollable
            bind:items
            columns={1}
            {item_height}
            on_item_click={async (e) => {
                console.log(selected_item);
                on_item_click(e);
            }}
            {end_reached}
            bind:try_scroll_into_view={try_scroll_selected_item_in_view}
            keyboard_control={false}
            bind:selected={selected_item_index}
            bind:end_is_visible
            bind:selected_item
            let:item
            let:selected
            let:index
        >
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
                class="item w-full h-full block relative rounded-xl"
                draggable={true}
                on:dragstart={() => dragstart(index, item)}
                on:drop|preventDefault={stores.drag_ops.drop}
                on:dragend={stores.drag_ops.dragend}
                ondragover="return false"
                on:dragenter={() => dragenter(index)}
                class:is-active={hovering === index}
                class:is-dragging={dragging_index === index}
                class:is-playing={index === playing}
                class:is-selected={selected}
            >
                <AudioListItem {item} ctx="Queue" show_buttons={selected} />
            </div>
        </VirtualScrollable>
    </div>
</div>

<style lang="postcss">
    .is-dragging {
        @apply opacity-40;
    }
    .item:hover,
    .is-selected {
        @apply bg-gray-200 bg-opacity-10;
    }
    .is-playing {
        @apply bg-gray-200 bg-opacity-20;
    }
    .is-active {
        @apply bg-green-400 bg-opacity-20;
    }
</style>
