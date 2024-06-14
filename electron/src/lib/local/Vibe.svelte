<script lang="ts">
    import PlayBar from "./PlayBar.svelte";
    import Queue from "./Queue.svelte";
    import SongBrowser from "./SongBrowser.svelte";
    import { onDestroy } from "svelte";
    import Toasts from "$lib/toast/Toasts.svelte";
    import { toast } from "$lib/toast/toast.ts";
    import BlobBg from "$lib/components/BlobBg.svelte";
    import * as stores from "$lib/stores.ts";
    import Prompt from "$lib/prompt/Prompt.svelte";

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

    const on_img_err = async () => {
        img_src = "";
    };
    let unsub = stores.playing_item.subscribe((item) => {
        if (!item) {
            return;
        }
        let img = item.thumbnail();
        if (img) {
            img_src = img;
        }
    });
    onDestroy(unsub);
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
                            stores.selected_menubar_option_index.set(i);
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
                                class="flex flex-col w-full overflow-hidden {$menubar_option.content_type ==
                                'queue'
                                    ? 'h-full'
                                    : 'h-0'}"
                            >
                                <div class="flex flex-col h-full">
                                    <Queue
                                        bind:item_height
                                        bind:dragend={queue_dragend}
                                        {mobile}
                                    />
                                </div>
                            </div>
                        {/if}

                        <div
                            class="w-full {$menubar_option.content_type ==
                            'queue'
                                ? 'h-0 overflow-hidden'
                                : 'h-full'}"
                        >
                            <SongBrowser
                                bind:item_height
                                columns={browse_columns}
                                {queue_dragend}
                            />
                        </div>

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
                    </div>
                </div>
            </browse>
        </search-area>

        {#if !mobile}
            <queue-area class="flex flex-col h-full">
                <Queue
                    bind:item_height
                    bind:dragend={queue_dragend}
                    {mobile}
                />
            </queue-area>
        {/if}
    </all-contents>

    <play-bar class="px-2 pb-2 pt-4">
        <PlayBar {mobile} />
    </play-bar>

    <div class="w-full h-full absolute -z-30 brightness-50">
        <BlobBg />
    </div>

    <!-- grain applies over both the bg and the song-browser image cuz of z-index i think -->
    <div class="-z-20 grainy grainy-bg" />
</div>

<Prompt />
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
