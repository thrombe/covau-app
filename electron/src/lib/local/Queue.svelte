<script lang="ts" context="module">
    let selected_item_index: number;
</script>

<script lang="ts">
    import AudioListItem from "$lib/components/AudioListItem.svelte";
    import type { ListItem } from "$lib/searcher/item.ts";
    import { onDestroy, tick } from "svelte";
    import type { Unique } from "../virtual";
    import VirtualScrollable from "$lib/components/VirtualScrollable.svelte";
    import { toast } from "$lib/toast/toast.ts";
    import { queue } from "$lib/stores.ts";
    import { type QueueManager } from "./queue.ts";
    import { get, readable, type Readable } from "svelte/store";

    export let item_height: number;
    export let dragend = (e: DragEvent) => {
        hovering = null;
        dragging_index = null;
    };
    let items: Unique<ListItem, string>[] = [];
    export let mobile = false;

    let playing: number | null = null;
    let options = $queue.options();

    let unsub = queue.subscribe((q) => {
        playing = q.playing_index;
        options = q.options();
    });
    onDestroy(unsub);

    let show_menu = false;
    const menu_disabler = () => {
        window.removeEventListener("click", menu_disabler);
        show_menu = false;
    };
    let on_menu_click = () => {
        if (!show_menu) {
            show_menu = true;
            setTimeout(() => {
                window.addEventListener("click", menu_disabler);
            }, 300);
        }
    };

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

    const on_item_click = async (t: Unique<ListItem, unknown>) => {};
    let selected_item: Unique<ListItem, unknown>;
    let try_scroll_selected_item_in_view: () => Promise<void>;

    let hovering: number | null = null;
    let dragging_index: number | null = null;
    const drop = async (event: DragEvent, target: number) => {
        dragend(event);
        event.dataTransfer!.dropEffect = "move";

        if (event.dataTransfer?.getData("covau/dragndrop")) {
            let start_index = parseInt(
                event.dataTransfer.getData("covau/dragndrop")
            );

            await $queue.move(start_index, target);
            queue.update((q) => q);
        } else if (event.dataTransfer?.getData("covau/dragndropnew")) {
            let new_id = event.dataTransfer.getData("covau/dragndropnew");

            toast("unimplemented");
            // TODO:
            // await $queue.insert(target, new_id);
            // queue.update(q => q);
        }
    };

    // can't drag items and scroll at the same time. bummer
    const dragstart = (event: DragEvent, i: number) => {
        event.dataTransfer!.effectAllowed = "move";
        event.dataTransfer!.dropEffect = "move";
        dragging_index = i;
        event.dataTransfer!.setData("covau/dragndrop", i.toString());
    };

    const dragenter = (e: DragEvent, index: number) => {
        if (!!e.dataTransfer?.getData("covau/ignore")) {
            return;
        }
        if (items.length > index) {
            hovering = index;
        } else {
            // if it is input bar - select the thing above it
            hovering = index - 1;
        }
    };
</script>

<div class="flex flex-col h-full w-full">
    <div class="p-2 pl-0 h-16">
        <div class="flex flex-row rounded-xl h-full bg-gray-400 bg-opacity-20">
            <div class="h-full pl-2 pr-2 flex-grow">
                <div class="h-full w-full text-center flex flex-col justify-center text-gray-200 text-xl font-bold">
                    Queue
                </div>
                <!-- <InputBar
                    placeholder={"Queue"}
                    value={""}
                    on_enter={async () => {}}
                /> -->
            </div>

            <button
                class="my-2 mr-2 p-1 aspect-square relative"
                on:click={on_menu_click}
                class:menu-open={show_menu}
                class:hidden={options.length == 0}
            >
                <img
                    class="w-full h-full opacity-75"
                    alt="three dot menu icon"
                    src="/static/three-dot-menu.svg"
                />
                <div
                    class="absolute right-10 top-0 flex flex-col gap-1 p-2 bg-gray-300 bg-opacity-20 rounded-xl backdrop-blur-md z-10"
                    class:hidden={!show_menu}
                >
                    {#each options as option}
                        <button on:click={option.onclick}>
                            <div
                                class="flex flex-row rounded-md p-2 pr-8 hover:bg-gray-100 hover:bg-opacity-15"
                            >
                                <img
                                    alt="three dot menu icon"
                                    class="h-4 w-4 m-1 mr-4"
                                    src={option.icon}
                                />

                                <item-title
                                    class="flex flex-col justify-end h-1/2 text-sm text-gray-200"
                                >
                                    <txt
                                        class="w-full text-ellipsis whitespace-nowrap overflow-hidden select-none"
                                    >
                                        {option.tooltip}
                                    </txt>
                                </item-title>
                            </div>
                        </button>
                    {/each}
                </div>
            </button>
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
            <item
                class="w-full h-full block relative rounded-xl"
                draggable={index != items.length}
                on:dragstart={(event) => dragstart(event, index)}
                on:drop|preventDefault={(event) => drop(event, index)}
                on:dragend={dragend}
                ondragover="return false"
                on:dragenter={(e) => dragenter(e, index)}
                class:is-active={hovering === index && items.length != index}
                class:is-dragging={dragging_index === index}
                class:is-playing={index === playing}
                class:is-selected={selected}
            >
                <AudioListItem {item} ctx="Queue" show_buttons={selected} />
            </item>
        </VirtualScrollable>
    </div>
</div>

<style lang="postcss">
    item.is-dragging {
        @apply opacity-40;
    }
    item.is-selected,
    item:hover {
        @apply bg-gray-200 bg-opacity-10;
    }
    item.is-playing {
        @apply bg-gray-200 bg-opacity-20;
    }
    item.is-active {
        @apply bg-green-400 bg-opacity-20;
    }

    item button {
        display: none;
    }
    item:hover button,
    .is-selected button {
        display: block;
    }

    .pop-button {
        @apply absolute p-1 m-2 rounded-md bg-gray-200 bg-opacity-30 text-gray-900 font-bold right-0 top-0;
    }
</style>
