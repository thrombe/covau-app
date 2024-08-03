<script lang="ts" context="module">
    let selected_item_index: number;
</script>

<script lang="ts">
    import AudioListItem from "$lib/components/AudioListItem.svelte";
    import { CustomListItem, type ListItem } from "$lib/searcher/item.ts";
    import { onDestroy, tick } from "svelte";
    import type { Unique } from "../utils.ts";
    import VirtualScrollable from "$lib/components/VirtualScrollable.svelte";
    import * as stores from "$lib/stores.ts";
    import { AutoplayQueueManager } from "./queue.ts";
    import { get, readable, type Readable, type Writable } from "svelte/store";
    import ThreeDotMenu from "$lib/components/ThreeDotMenu.svelte";
    import * as icons from "$lib/icons.ts";
    import { toast } from "$lib/toast/toast.ts";
    import { StaticSearcher } from "$lib/searcher/searcher.ts";
    import * as utils from "$lib/utils.ts";

    // prettier-ignore
    type QueueItem = {
        typ: "Song",
        item: ListItem,
    } | {
        typ: "AutoplaySong",
        item: ListItem,
    } | {
        typ: "AutoplayOption",
        enabled: boolean,
        onclick: (() => Promise<void>) | (() => void),
    };

    export let item_height: number;
    let items: Unique<QueueItem, string>[] = [];
    export let mobile = false;

    let queue = stores.queue;

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
    const dragenter = async (index: number) => {
        if (get(stores.drag_item) == null) {
            return;
        }
        hovering = index;
        await stores.drag_ops.set_source({
            source_key: drag_source_key,
            drop_callback: async () => {
                let item = get(stores.drag_item);
                if (!item) {
                    return;
                }

                if (!item.item.is_playable()) {
                    toast(`type ${item.item.typ()} is not playable`, "error");
                    return;
                }

                let is_outsider = item.source_key != drag_source_key;
                let q = get(queue);
                let handled = await q.handle_drop(
                    item.item,
                    index,
                    is_outsider
                );
                if (handled) {
                    queue.update((t) => t);
                }
            },
            drop_cleanup: async () => {
                dragging_index = null;
                hovering = null;
            },
        });
    };

    let playing: number | null = null;
    let options = $queue.options();

    let unsub = queue.subscribe(async (q) => {
        // TODO: moving items in queue triggers this
        if (q.playing_index != null && playing != null) {
            if (is_in_view(playing)) {
                if (q.playing_index == playing + 1) {
                    setTimeout(() => {
                        scroll_relative(1);
                    }, 0);
                } else if (q.playing_index == playing - 1) {
                    setTimeout(() => {
                        scroll_relative(-1);
                    }, 0);
                }
            }
            if (playing == selected_item_index) {
            }
        }
        playing = q.playing_index;
        options = q.options();
    });
    onDestroy(unsub);

    let end_is_visible = false;
    const end_reached = async (q: Readable<AutoplayQueueManager> = queue) => {
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
    const next_page = async (q: Readable<AutoplayQueueManager>) => {
        let queue = get(q);
        let r = await queue.next_page();
        let r2 = r.map((e) => ({
            id: e.get_key(),
            data: {
                typ: "Song",
                item: e,
            },
        })) as typeof items;
        let autoplay_next = queue.autoplay_peek_item();
        if (autoplay_next) {
            let autoplay_item = new CustomListItem(
                autoplay_next.get_key() as string,
                `Autoplay: ${autoplay_next.title()}`,
                "Custom",
                autoplay_next.title_sub()
            );
            autoplay_item._thumbnail = autoplay_next.thumbnail();
            let ops = autoplay_item.common_options();
            autoplay_item._sections = autoplay_next.sections();
            autoplay_item._options = {
                ...autoplay_item._options,
                top_right: {
                    title: "Skip",
                    icon: icons.remove,
                    onclick: async () => {
                        await queue.autoplay_skip();
                        stores.queue.update((t) => t);
                    },
                },
                icon_top: {
                    title: "Play",
                    icon: icons.play,
                    onclick: async () => {
                        await queue.autoplay_next();
                        stores.queue.update((t) => t);
                        setTimeout(() => {
                            scroll_relative(1);
                        }, 100);
                    },
                },
                bottom: [
                    ops.open_details,
                    {
                        title: "Explore autoplay items",
                        icon: icons.open_new_tab,
                        onclick: async () => {
                            let s = StaticSearcher(queue.autoplay_items() ?? []);
                            stores.new_tab(s, "Autoplay items");
                        },
                    },
                ],
            };
            r2.push({
                id: autoplay_next.get_key() as string,
                data: {
                    typ: "AutoplaySong",
                    item: autoplay_item,
                },
            });
            r2.push({
                id: stores.new_key().toString(),
                data: {
                    typ: "AutoplayOption",
                    enabled: true,
                    onclick: async () => {
                        queue.autoplay_disable();
                        stores.queue.update((t) => t);
                    },
                },
            });
        } else {
            r2.push({
                id: stores.new_key().toString(),
                data: {
                    typ: "AutoplayOption",
                    enabled: queue.autoplay_is_enabled(),
                    onclick: async () => {
                        await queue.autoplay_toggle();
                        stores.queue.update((t) => t);
                    },
                },
            });
        }
        items = r2;
    };
    export const search_objects = async (
        q: Readable<AutoplayQueueManager> = queue
    ) => {
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

    let selected_item: Unique<QueueItem, unknown>;
    let try_scroll_selected_item_in_view: () => Promise<void>;
    let scroll_relative: (items: number) => void;
    let is_in_view: (index: number) => boolean;
</script>

<div class="flex flex-col h-full w-full">
    <div class="{mobile ? '' : 'p-2 pl-0'} h-16">
        <div
            class="flex flex-row h-full {mobile
                ? 'py-2 bg-gray-900 bg-opacity-30'
                : 'rounded-xl bg-gray-400 bg-opacity-20'}"
        >
            <div class="h-full pl-2 pr-2 flex-grow">
                <div
                    class="h-full w-full text-center flex flex-col justify-center text-gray-200 text-xl font-bold select-none"
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
                <ThreeDotMenu
                    {options}
                    classes="top-8 right-8"
                    let:on_menu_click
                    let:show_menu
                >
                    <button
                        class="w-full h-full"
                        on:pointerup={on_menu_click}
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
            {end_reached}
            bind:try_scroll_into_view={try_scroll_selected_item_in_view}
            keyboard_control={false}
            bind:selected={selected_item_index}
            bind:end_is_visible
            bind:scroll_relative
            bind:is_in_view
            bind:selected_item
            let:item
            let:selected
            let:index
        >
            {#if item.typ == "Song"}
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div
                    class="item w-full h-full block relative rounded-xl"
                    draggable={true}
                    on:dragstart={() => dragstart(index, item.item)}
                    on:drop|preventDefault={stores.drag_ops.drop}
                    on:dragend={stores.drag_ops.dragend}
                    ondragover="return false"
                    on:dragenter={() => dragenter(index)}
                    class:is-active={hovering === index}
                    class:is-dragging={dragging_index === index}
                    class:is-playing={index === playing}
                    class:is-selected={selected}
                >
                    <AudioListItem
                        item={item.item}
                        ctx="Queue"
                        show_buttons={selected}
                    />
                </div>
            {:else if item.typ == "AutoplaySong"}
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div
                    class="item w-full h-full block relative rounded-xl opacity-70"
                    draggable={false}
                    on:drop|preventDefault={stores.drag_ops.drop}
                    on:dragend={stores.drag_ops.dragend}
                    ondragover="return false"
                    on:dragenter={() => dragenter(index)}
                    class:is-active={hovering === index}
                    class:is-dragging={dragging_index === index}
                    class:is-playing={index === playing}
                    class:is-selected={selected}
                >
                    <AudioListItem
                        item={item.item}
                        ctx="Queue"
                        show_buttons={selected}
                    />
                </div>
            {:else if item.typ == "AutoplayOption"}
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div
                    class="w-full h-full block relative rounded-xl"
                    draggable={false}
                    on:drop|preventDefault={stores.drag_ops.drop}
                    on:dragenter={() => dragenter(index)}
                    ondragover="return false"
                    class:is-active={hovering === index}
                    class:is-dragging={dragging_index === index}
                >
                    <div
                        class="p-2 h-full flex justify-center place-items-center"
                        on:pointerup={utils.wrap_toast(item.onclick)}
                    >
                        <label class="inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={item.enabled}
                                class="sr-only peer"
                            />
                            <div
                                class="
                              relative peer-focus:outline-none peer-focus:ring-0 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:rounded-full after:transition-all
                              w-11 h-6 after:h-5 after:w-5
                              bg-gray-200 bg-opacity-20 peer-checked:bg-blue-600 peer-checked:bg-opacity-50 after:bg-gray-200"
                            />
                            <span
                                class="ms-3 text-sm font-medium select-none text-gray-200"
                            >
                                Autoplay
                            </span>
                        </label>
                    </div>
                </div>
            {/if}
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
