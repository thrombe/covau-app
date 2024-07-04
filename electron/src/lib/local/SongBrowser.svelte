<script lang="ts">
    import AudioListItem from "$lib/components/AudioListItem.svelte";
    import Explorer from "$lib/components/Explorer.svelte";
    import InputBar from "$lib/components/InputBar.svelte";
    import * as stores from "$lib/stores.ts";
    import type { ListItem, Option } from "$lib/searcher/item.ts";
    import { onDestroy } from "svelte";
    import { get } from "svelte/store";
    import * as icons from "$lib/icons.ts";
    import ThreeDotMenu from "$lib/components/ThreeDotMenu.svelte";
    import { exhausted } from "$lib/virtual";
    import DetailItem from "$lib/components/DetailItem.svelte";

    export let columns: number;
    export let item_height: number;
    export let queue_dragend: (e: DragEvent) => void = () => {};

    let search_query: string = "";
    let search_input_element: HTMLElement | null;

    let search_objects: () => Promise<void>;
    let try_scroll_selected_item_in_view: () => Promise<void>;

    let dragstart = (event: DragEvent, t: ListItem) => {
        // if (t.data.id) {
        //     if (t.typ == "song" || t.typ == "video") {
        //         event.dataTransfer!.effectAllowed = "move";
        //         event.dataTransfer!.dropEffect = "move";
        //         event.dataTransfer!.setData("covau/dragndropnew", t.data.id);
        //         event.dataTransfer!.setData(
        //             "text/plain",
        //             "https://youtu.be/" + t.data.id
        //         );
        //     } else if (t.typ == "artist") {
        //     } else if (t.typ == "album") {
        //     } else if (t.typ == "playlist") {
        //     }
        // }
    };

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

<div class="w-full h-full flex flex-col">
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
                <div class="flex h-full w-full items-center">
                    <div class="flex w-full text-center justify-center text-xl">
                        {curr_tab?.name ?? "Loading..."}
                    </div>
                </div>
            {/if}

            <ThreeDotMenu
                options={options}
                let:on_menu_click
            >
                <div class="relative h-full" class:hidden={options.length == 0}>
                    <button
                        class="absolute right-0 h-full aspect-square flex flex-col items-center"
                        on:click={on_menu_click}
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

        <browse-tab-bar
            class="flex flex-row overflow-x-auto gap-1 px-1 justify-center"
        >
            {#each tabs as tab, i}
                <div
                    class="flex flex-row border-b-2 px-1 items-center content-center
                            {curr_tab == tab
                        ? 'font-bold border-gray-200'
                        : 'border-gray-600'}"
                >
                    <button
                        class="text-gray-400 flex-none text-ellipsis whitespace-nowrap overflow-hidden"
                        style="max-width: 12rem;"
                        on:click={async () => {
                            stores.curr_tab_index.set(i);
                        }}
                    >
                        {tab.name}
                    </button>
                    <div class="h-5 w-5" class:hidden={i === 0}>
                        <button
                            class="h-full w-full flex items-center"
                            on:click={() => {
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
        </browse-tab-bar>
    </bar-area>

    {#each tabs as tab (tab.key)}
        <browse-area class={curr_tab == tab ? "" : "hidden"}>
            {#if tab.type == "browse"}
                <Explorer
                    searcher={tab.searcher}
                    {columns}
                    bind:item_height
                    keyboard_control={false}
                    bind:search_objects
                    bind:try_scroll_selected_item_in_view
                    let:item
                    let:selected
                >
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <list-item class:selected>
                        <div
                            draggable={true}
                            on:dragstart={(event) => dragstart(event, item)}
                            on:dragend={queue_dragend}
                            class="item-bg"
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
                <DetailItem
                    item={tab.item}
                />
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

    list-item {
        @apply w-full h-full block relative pl-4;
    }

    .item-bg {
        @apply w-full h-full;
    }

    .open-button {
        @apply absolute aspect-square p-1 m-2 right-0 top-0 bg-gray-200 bg-opacity-30 rounded-md text-gray-900 text-lg font-bold;
        @apply hidden;
    }

    list-item:hover .open-button,
    .selected .open-button {
        @apply block;
    }

    list-item:hover .item-bg,
    .selected .item-bg {
        @apply bg-gray-200 bg-opacity-10 rounded-xl;
    }
</style>
