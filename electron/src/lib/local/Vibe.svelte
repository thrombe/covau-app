<script lang="ts">
    import PlayBar from "./PlayBar.svelte";
    import Queue from "./Queue.svelte";
    import SongBrowser from "./SongBrowser.svelte";
    import type { Unique } from "$lib/virtual.ts";
    import { onMount } from "svelte";
    import Toasts from "$lib/toast/Toasts.svelte";
    import { toast } from "$lib/toast/toast.ts";
    import BlobBg from "$lib/components/BlobBg.svelte";
    import * as Db from "$lib/searcher/db.ts";
    import { tube } from "$lib/stores.ts";
    import * as stores from "$lib/stores.ts";
    import type { ListItem } from "$lib/searcher/item.ts";

    onMount(() => {
    });

    stores.queue_searcher.set(Db.Db.new({
        query_type: "search",
        type: "MusimanagerSong",
        query: "milet",
    }, 30));

    let playing_index: number | null = null;

    let item_height: number = 75;
    let item_min_width = 290;
    let browse_columns: number = 1;
    let browse_width: number;
    const on_window_resize = () => {
        browse_columns = Math.min(
            3,
            Math.max(Math.floor(browse_width / item_min_width), 1)
        );
    };
    $: if (browse_width) {
        on_window_resize();
    }

    let queue_element: HTMLElement;
    let queue_items: Unique<ListItem, string>[] = [];
    let queue_selected_item_index: number = -1; // -1 avoids selecting input bar in queue when nothing is in queue
    let queue_playing_vid_info: ListItem | null;
    let on_queue_item_add = async (id: string) => {
        // if (player.synced_data.queue.filter((t) => t == id).length > 0) {
        //     await toast("item already in queue");
        // } else {
        //     await player.queue(id);
        //     await toast("item added");
        // }
    };
    let on_queue_item_move = async (from: number, to: number) => {
        // await player.queue_item_move(from, to);
    };
    let on_queue_item_insert = async (index: number, id: string) => {
        // if (player.synced_data.queue.filter((t) => t == id).length > 0) {
        //     await toast("item already in queue");
        // } else {
        //     await player.queue_item_insert(index, id);
        // }
    };
    let on_queue_item_delete = async (index: number, id: string) => {
        // if (player.synced_data.queue[index] === id) {
        //     await player.queue_item_delete(index);
        // } else {
        //     await toast(`item at index ${index} is not ${id}`, "error");
        // }
    };
    let on_queue_item_play = async (index: number) => {
        // let path = queue_items[index].data.last_known_path;
        // let uri = "file://" + path ?? null;
        // player.play(uri);
        // await player.play_index(index);
    };

    let queue_dragend: (e: DragEvent) => void;

    let menubar_options = stores.menubar_options;
    let menubar_related_option = $menubar_options[6] as unknown as {
        id: string | null;
    };
    let menubar_queue_option: stores.MenubarOption = {
        name: "Queue",
        content_type: "queue",
    };
    let menubar_option = stores.selected_menubar_option;

    // $: if (queue_selected_item_index != null) {
    //     let id: string | null | undefined;
    //     if (queue_selected_item_index > -1) {
    //         id = queue_items[queue_selected_item_index].id;
    //     } else if (queue_playing_vid_info) {
    //         id = queue_playing_vid_info.basic_info.id ?? null;
    //     } else {
    //         id = null;
    //     }

    //     if (
    //         typeof id !== "undefined" &&
    //         menubar_related_option.id != id &&
    //         menubar_option.content_type === "related-music"
    //     ) {
    //         menubar_related_option.id = id;
    //         menubar_option = menubar_option;
    //     } else {
    //         menubar_related_option.id = id ?? null;
    //     }
    // }

    let width: number;
    let mobile = false;
    $: if (width) {
        if (width < item_min_width + 330 + 50) {
            if (!mobile) {
                $menubar_options = [menubar_queue_option, ...$menubar_options];
            }
            mobile = true;
        } else {
            if (mobile) {
                $menubar_options = $menubar_options.filter(
                    (o) => o.content_type != "queue"
                );
            }
            mobile = false;
        }
    }

    let img_src = "";
    let img_h: number;
    let img_w: number;
    let img_squared = false;

    // $: if (queue_playing_vid_info) {
    //     let q = queue_playing_vid_info.basic_info;
    //     if (q.thumbnail && q.thumbnail.length > 0) {
    //         img_src = q.thumbnail[0].url;
    //     }
    // }

    const on_img_err = async () => {
        img_src = "";
    };
</script>

<svelte:window on:resize={on_window_resize} bind:innerWidth={width} />
<svelte:head>
    <title>covau! vibe amongst us</title>
</svelte:head>

<div
    class="relative flex flex-col w-full h-full bg-gray-900 bg-opacity-30"
    style="--queue-area-width: {!mobile
        ? 'min(475px, max(330px, 33.333vw))'
        : '0px'};"
>
    <all-contents class="flex flex-row">
        <search-area class="flex flex-col">
            <top-menubar
                class="w-full flex flex-row gap-2 py-2 px-6 justify-start text-gray-200 overflow-x-auto scrollbar-hide"
            >
                {#each $menubar_options as typ, i}
                    <button
                        class="flex-none rounded-xl p-2 font-bold bg-gray-200 {$menubar_option ==
                        typ
                            ? 'bg-opacity-30'
                            : 'bg-opacity-10'}"
                        on:click={() => {
                            if (
                                typ.content_type === "related-music" &&
                                menubar_related_option.id == null
                            ) {
                                toast("no queue item selected", "info");
                                return;
                            }
                            stores.selected_menubar_option_index.set(i)
                        }}
                    >
                        {typ.name}
                    </button>
                {/each}
            </top-menubar>

            <browse class={!mobile ? "pr-4 pl-4" : ""}>
                <div
                    class="w-full h-full rounded-3xl overflow-hidden"
                    bind:clientWidth={browse_width}
                >
                    <div
                        class="relative w-full h-full"
                        bind:clientWidth={img_w}
                        bind:clientHeight={img_h}
                    >
                        {#if mobile}
                            <div
                                class="flex flex-col w-full {$menubar_option ==
                                menubar_queue_option
                                    ? 'h-full'
                                    : 'h-0'}"
                            >
                                <div
                                    bind:this={queue_element}
                                    class="flex flex-col overflow-y-auto h-full"
                                >
                                    <div
                                        class="pl-2"
                                        style="height: calc(100% - 3.5rem);"
                                    >
                                        <Queue
                                            bind:items={queue_items}
                                            bind:item_height
                                            bind:selected_item_index={queue_selected_item_index}
                                            bind:playing={playing_index}
                                            bind:on_item_add={on_queue_item_add}
                                            bind:tube={$tube}
                                            bind:dragend={queue_dragend}
                                            bind:playing_video_info={queue_playing_vid_info}
                                            {mobile}
                                            insert_item={on_queue_item_insert}
                                            move_item={on_queue_item_move}
                                            delete_item={on_queue_item_delete}
                                            play_item={on_queue_item_play}
                                        >
                                        </Queue>
                                    </div>
                                </div>
                            </div>
                        {/if}

                        <div
                            class="absolute h-full w-full left-0 top-0 -z-20 brightness-75"
                        >
                            <BlobBg
                                colors={[
                                    "#4F0D1B",
                                    "#912E40",
                                    "#504591",
                                    "#5197B9",
                                    "#16183E",
                                    "#925FD6",
                                ]}
                            />
                        </div>
                        <img
                            class="absolute w-full h-full left-0 top-0 -z-20 overflow-hidden object-cover brightness-50 blur-md scale-110"
                            style="{img_squared ? '' : 'lol'}height: {100 *
                                Math.max(img_w / img_h, 1)}%;"
                            src={img_src}
                            alt=""
                            on:error={on_img_err}
                        />

                        <div
                            class="w-full h-full {$menubar_option.content_type ==
                            'queue'
                                ? 'h-0 overflow-hidden'
                                : ''}"
                        >
                            <SongBrowser
                                bind:item_height
                                columns={browse_columns}
                                bind:tube={$tube}
                                {queue_dragend}
                                queue_item_add={on_queue_item_add}
                            />
                        </div>
                    </div>
                </div>
            </browse>
        </search-area>

        {#if !mobile}
            <queue-area class="flex flex-col">
                <queue
                    bind:this={queue_element}
                    class="flex flex-col overflow-y-auto"
                    style="height: calc(100%);"
                >
                    <queue-content class="">
                        <Queue
                            bind:items={queue_items}
                            bind:item_height
                            bind:selected_item_index={queue_selected_item_index}
                            bind:playing={playing_index}
                            bind:on_item_add={on_queue_item_add}
                            bind:tube={$tube}
                            bind:dragend={queue_dragend}
                            bind:playing_video_info={queue_playing_vid_info}
                            {mobile}
                            insert_item={on_queue_item_insert}
                            move_item={on_queue_item_move}
                            delete_item={on_queue_item_delete}
                            play_item={on_queue_item_play}
                        >
                        </Queue>
                    </queue-content>
                </queue>
            </queue-area>
        {/if}
    </all-contents>

    <play-bar class="px-2 pb-2 pt-4">
        <PlayBar
            {mobile}
            audio_info={null}
        />
    </play-bar>

    <div class="w-full h-full absolute -z-30 brightness-50">
        <BlobBg />
    </div>

    <!-- grain applies over both the bg and the song-browser image cuz of z-index i think -->
    <div class="-z-20 grainy grainy-bg" />
</div>

<Toasts />

<style lang="postcss">
    * {
        --play-bar-height: 70px;
        --top-menubar-height: 50px;
        --search-bar-height: 50px;
        --browse-tab-bar-height: 25px;
        --scrollbar-width: 8px;

        font-family: monospace;
    }

    all-contents {
        height: calc(100% - var(--play-bar-height));
    }

    search-area {
        width: calc(100% - var(--queue-area-width));
    }

    top-menubar {
        height: var(--top-menubar-height);
    }

    browse {
        height: calc(100% - var(--top-menubar-height));
    }

    queue-area {
        width: var(--queue-area-width);
    }

    queue {
    }

    queue-content {
        height: calc(100%);
    }

    video-box {
    }

    play-bar {
        height: var(--play-bar-height);
    }

    .scrollbar-hide::-webkit-scrollbar {
        display: none;
    }

    /* For IE, Edge and Firefox */
    .scrollbar-hide {
        -ms-overflow-style: none; /* IE and Edge */
        scrollbar-width: none; /* Firefox */
    }
</style>
