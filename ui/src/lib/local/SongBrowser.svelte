<script lang="ts">
    import AudioListItem from "$lib/components/AudioListItem.svelte";
    import Explorer from "$lib/components/Explorer.svelte";
    import InputBar from "$lib/components/InputBar.svelte";
    import * as stores from "$lib/stores.ts";
    import type { Option } from "$lib/searcher/item.ts";
    import { onDestroy } from "svelte";
    import { get } from "svelte/store";
    import * as icons from "$lib/icons.ts";
    import ThreeDotMenu from "$lib/components/ThreeDotMenu.svelte";
    import { exhausted } from "$lib/utils.ts";
    import DetailItem from "$lib/components/DetailItem.svelte";
    import Tooltip from "$lib/tooltip/Tooltip.svelte";

    export let columns: number;
    export let item_height: number;

    let search_query: string = "";
    let search_input_element: HTMLElement | null;

    let tabs: stores.Tab[] = [];
    let curr_tab: stores.Tab;
    let options: Option[] = [];

    let unsub = stores.tabs.subscribe((t) => {
        tabs = t;
    });
    onDestroy(unsub);
    unsub = stores.curr_tab.subscribe((t) => {
        curr_tab = t;
        if (!t) {
            return;
        }
        // prettier-ignore
        switch (t.type) {
            case "detail": {
                options = [];
                search_query = "";
            } break;
            case "browse": {
                search_query = get(t.query);
                options = get(t.options);
            } break;
            default:
                throw exhausted(t);
        }
    });
    onDestroy(unsub);
</script>

<div class="relative w-full h-full flex flex-col">
    <bar-area class="flex flex-col bg-gray-900 bg-opacity-30">
        <search-bar class="flex flex-row h-full">
            {#if curr_tab && curr_tab.type == "browse" && curr_tab.new_searcher != null}
                <InputBar
                    placeholder={"Search"}
                    bind:value={search_query}
                    bind:input_element={search_input_element}
                    on_enter={async (e) => {
                        if (curr_tab.type != "browse") {
                            throw new Error("unreachable");
                        }

                        stores.query_input.set(search_query);
                        if (curr_tab.query) {
                            curr_tab.query.set(search_query);
                        }
                        stores.update_current_tab();

                        e.preventDefault();
                    }}
                />
            {:else}
                <div class="flex h-full w-full px-4 items-center">
                    <div
                        class="w-full inline-block text-center text-xl text-nowrap text-ellipsis overflow-x-hidden select-none"
                    >
                        {curr_tab?.name ?? "Loading..."}
                    </div>
                </div>
            {/if}

            <ThreeDotMenu {options} let:on_menu_click>
                <div class="relative h-full" class:hidden={options.length == 0}>
                    <button
                        class="absolute right-0 h-full aspect-square flex flex-col items-center"
                        on:pointerup={on_menu_click}
                    >
                        <div
                            class="w-full h-full flex flex-col pr-1 rounded-md opacity-60 hover:opacity-100"
                        >
                            <img
                                alt="options"
                                draggable={false}
                                class="scale-[50%] max-h-full"
                                src={icons.three_dot_menu}
                            />
                        </div>
                    </button>
                </div>
            </ThreeDotMenu>
        </search-bar>

        <browse-tab-bar class="flex flex-row overflow-x-auto px-1 gap-1 w-full">
            <div class="block flex-grow"></div>
            {#each tabs as tab, i}
                <div
                    class={`flex flex-row border-b-2 px-1 items-center content-center
                            ${
                                curr_tab == tab
                                    ? "font-bold border-gray-200"
                                    : "border-gray-600"
                            }`}
                >
                    <Tooltip tooltip={tab.name} let:on_enter let:on_leave>
                        <button
                            class="text-gray-400 flex-none text-ellipsis whitespace-nowrap overflow-hidden"
                            style="max-width: 12rem;"
                            on:pointerup={async () => {
                                stores.curr_tab_index.set(i);
                            }}
                            on:pointerenter={on_enter}
                            on:pointerleave={on_leave}
                        >
                            {tab.name}
                        </button>
                    </Tooltip>
                    <div class="h-5 w-5" class:hidden={i === 0}>
                        <button
                            class="h-full w-full flex items-center"
                            on:pointerup={() => {
                                stores.pop_tab(i);
                            }}
                        >
                            <div
                                class="w-full h-full pt-[0.15rem] pl-2 pb-[0.2rem] rounded-md opacity-60 hover:opacity-100"
                            >
                                <img
                                    alt="close"
                                    draggable={false}
                                    class="scale-[70%]"
                                    src={icons.xmark}
                                />
                            </div>
                        </button>
                    </div>
                </div>
            {/each}
            <div class="block flex-grow"></div>
        </browse-tab-bar>
    </bar-area>

    {#each tabs as tab (tab.key)}
        <browse-area class={`${curr_tab == tab ? "" : "absolute -z-[70]"}`}>
            {#if tab.type == "browse"}
                <Explorer
                    searcher={tab.searcher}
                    updater={tab.updater}
                    source_key={tab.key}
                    {columns}
                    bind:item_height
                    keyboard_control={false}
                    let:item
                    let:index
                    let:selected
                    let:hovering
                    let:dragging_index
                    let:dragstart
                    let:dragenter
                >
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <list-item
                        class="w-full h-full block relative px-2"
                        class:selected
                    >
                        <div
                            class="item w-full h-full rounded-xl"
                            draggable={true}
                            on:dragstart={(e) => dragstart(e, index, item)}
                            on:drop|preventDefault={stores.drag_ops.drop}
                            on:dragend={stores.drag_ops.dragend}
                            ondragover="return false"
                            on:dragenter={() => dragenter(index)}
                            class:selected
                            class:is-active={hovering === index}
                            class:is-dragging={dragging_index === index}
                            class:is-selected={selected}
                        >
                            <AudioListItem
                                {item}
                                ctx="Browser"
                                show_buttons={selected}
                                alt_thumbnail={tab.thumbnail}
                            />
                        </div>
                    </list-item>
                </Explorer>
            {:else if tab.type == "detail"}
                <DetailItem item={tab.item} updater={tab.updater} />
            {:else}
                tab type {tab.type} not handled
            {/if}
        </browse-area>
    {/each}
</div>

<style lang="postcss">
    bar-area {
        height: calc(var(--search-bar-height) + var(--browse-tab-bar-height));
    }
    search-bar {
        height: var(--search-bar-height);
    }

    browse-tab-bar {
        height: var(--browse-tab-bar-height);
    }

    browse-area {
        height: calc(
            100% - var(--browse-tab-bar-height) - var(--search-bar-height)
        );
    }

    list-item:hover .item,
    .selected .item {
        @apply bg-gray-200 bg-opacity-10;
    }
    .is-dragging {
        @apply opacity-40;
    }
    .is-selected {
        @apply bg-gray-200 bg-opacity-10;
    }
    .is-active,
    .is-selected.is-active {
        @apply bg-green-400 bg-opacity-20;
    }
</style>
