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
    import { derived, get } from "svelte/store";
    import { prompter } from "$lib/prompt/prompt";
    import ThreeDotMenu from "$lib/components/ThreeDotMenu.svelte";
    import * as icons from "$lib/icons.ts";
    import type { Option } from "$lib/searcher/item.ts";
    import Video from "$lib/components/Video.svelte";

    let player_type = stores.player_type;

    // prettier-ignore
    stores.menubar_options.set([
        { key: stores.new_key(), name: "Home", content_type: "home-feed" },
        { key: stores.new_key(), name: "Mm Song", content_type: "db", type: "MmSong" },
        { key: stores.new_key(), name: "Mm Queues", content_type: "db", type: "MmQueue" },
        { key: stores.new_key(), name: "Mm Playlists", content_type: "db", type: "MmPlaylist" },
        { key: stores.new_key(), name: "Mm Artist", content_type: "db", type: "MmArtist" },
        { key: stores.new_key(), name: "Mm Album", content_type: "db", type: "MmAlbum" },
        { key: stores.new_key(), name: "Yt Song", content_type: "list", type: "YtSong" },
        { key: stores.new_key(), name: "Yt Video", content_type: "list", type: "YtVideo" },
        { key: stores.new_key(), name: "Yt Album", content_type: "list", type: "YtAlbum" },
        { key: stores.new_key(), name: "Yt Playlist", content_type: "list", type: "YtPlaylist" },
        { key: stores.new_key(), name: "Yt Artist", content_type: "list", type: "YtArtist" },
        { key: stores.new_key(), name: "Yt Channel", content_type: "list", type: "YtChannel" },
        { key: stores.new_key(), name: "St Song", content_type: "db", type: "StSong" },
        { key: stores.new_key(), name: "St Album", content_type: "db", type: "StAlbum" },
        { key: stores.new_key(), name: "St Playlist", content_type: "db", type: "StPlaylist" },
        { key: stores.new_key(), name: "St Artist", content_type: "db", type: "StArtist" },
        { key: stores.new_key(), name: "Song", content_type: "db", type: "Song" },
        { key: stores.new_key(), name: "Playlist", content_type: "db", type: "Playlist" },
        { key: stores.new_key(), name: "Queue", content_type: "db", type: "Queue" },
        { key: stores.new_key(), name: "Updater", content_type: "db", type: "Updater" },
        { key: stores.new_key(), name: "Db Mbz Artist", content_type: "db", type: "MbzArtist" },
        { key: stores.new_key(), name: "Db Mbz Recording", content_type: "db", type: "MbzRecording" },
        { key: stores.new_key(), name: "Artist Blacklist", content_type: "db", type: "ArtistBlacklist" },
        { key: stores.new_key(), name: "Song Blacklist", content_type: "db", type: "SongBlacklist" },
        // { key: stores.new_key(), name: "Local State", content_type: "db", type: "LocalState" },
        { key: stores.new_key(), name: "Mbz Recording", content_type: "list", type: "MbzRecordingWithInfo" },
        { key: stores.new_key(), name: "Mbz Release", content_type: "list", type: "MbzReleaseWithInfo" },
        { key: stores.new_key(), name: "Mbz ReleaseGroup", content_type: "list", type: "MbzReleaseGroupWithInfo" },
        { key: stores.new_key(), name: "Mbz Artist", content_type: "list", type: "MbzArtist" },
        { key: stores.new_key(), name: "Lbz Radio", content_type: "list", type: "MbzRadioSong" },
        { key: stores.new_key(), name: "Covau Group", content_type: "list", type: "covau-group" },
        { key: stores.new_key(), name: "Related", content_type: "related-music", source: "Yt" },
        { key: stores.new_key(), name: "Radio", content_type: "related-music", source: "Mbz" },
    ]);
    // stores.selected_menubar_option_index.set(0);
    stores.set_player_type("MusiPlayer");

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

    let menubar_queue_option: stores.MenubarOption = {
        key: stores.new_key(),
        name: "Queue",
        content_type: "queue",
    };
    let menubar_option = stores.selected_menubar_option;

    let width: number;
    let mobile = false;
    $: if (width) {
        if (width < item_min_width + 330 + 50) {
            if (!mobile) {
                stores.insert_menu_item(menubar_queue_option, 0);
            }
            mobile = true;
        } else {
            if (mobile) {
                stores.pop_menu_item(menubar_queue_option.key);
            }
            mobile = false;
        }
    }

    let menubar_menu = derived(
        [stores.menubar_options, menubar_option, player_type],
        ([ops, curr_op, _player_type]) => {
            let menubar_options = ops.map(
                (o, i) =>
                    ({
                        icon: icons.covau_icon,
                        title: o.name,
                        onclick: async () => {
                            if (
                                o.content_type === "related-music" &&
                                !get(stores.playing_item)
                            ) {
                                toast("no queue item selected", "info");
                                return;
                            }
                            stores.selected_menubar_option_index.set(i);
                        },
                    } as Option)
            );

            let player_options = [
                {
                    icon: icons.default_music_icon,
                    title: "Musiplayer",
                    onclick: async () => {
                        await stores.set_player_type("MusiPlayer");
                    },
                },
                {
                    icon: icons.default_music_icon,
                    title: "Youtube Player",
                    onclick: async () => {
                        await stores.set_player_type("YtPlayer");
                    },
                },
                {
                    icon: icons.default_music_icon,
                    title: "Youtube Video Player",
                    onclick: async () => {
                        await stores.set_player_type("YtVideoPlayer");
                    },
                },
            ] as Option[];

            return [
                {
                    title: curr_op?.name,
                    options: menubar_options,
                },
                {
                    title: _player_type,
                    options: player_options,
                },
            ];
        }
    );

    let img_src = "";
    let img_h: number = 1;
    let img_w: number = 1;

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

    let playbar_kb_controls = true;
    prompter.active.subscribe((p) => {
        playbar_kb_controls = p == null;
    });
</script>

<svelte:window on:resize={on_window_resize} bind:innerWidth={width} />
<svelte:head>
    <title>covau! vibe amongst us</title>
</svelte:head>

<div
    class="relative flex flex-col w-full h-full bg-gray-900 bg-opacity-30"
    style={`--queue-area-width: ${
        !mobile ? "min(475px, max(330px, 33.333vw))" : "0px"
    };`}
>
    <all-contents class="flex flex-row">
        <search-area class="flex flex-col">
            <top-menubar class="w-full overflow-hidden px-4">
                <div
                    class="flex flex-row gap-2 py-2 h-full justify-start text-gray-200 overflow-x-auto scrollbar-hide"
                >
                    {#each $menubar_menu as options, i}
                        <ThreeDotMenu
                            options={options.options}
                            classes={`top-12 max-h-72`}
                            styles={`left: ${i * 4 + 1}rem;`}
                            let:on_menu_click
                        >
                            <button
                                class="flex flex-row gap-2 h-full rounded-xl p-2 pr-3 font-bold bg-gray-200 bg-opacity-10"
                                on:pointerup={on_menu_click}
                                class:hidden={options.options.length == 0}
                            >
                                <div
                                    class="w-full h-full aspect-square flex flex-col rounded-md opacity-60 hover:opacity-100"
                                >
                                    <img
                                        alt="options"
                                        draggable={false}
                                        class="scale-[100%] max-h-full"
                                        src={icons.caret_down}
                                    />
                                </div>
                                <div class="text-nowrap">{options.title}</div>
                            </button>
                        </ThreeDotMenu>
                    {/each}
                </div>
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
                                class="flex flex-col w-full overflow-hidden {$menubar_option?.content_type ==
                                'queue'
                                    ? 'h-full'
                                    : 'h-0'}"
                            >
                                <div class="flex flex-col h-full">
                                    <Queue bind:item_height {mobile} />
                                </div>
                            </div>
                        {/if}

                        <div
                            class="w-full {$menubar_option?.content_type ==
                            'queue'
                                ? 'h-0 overflow-hidden'
                                : 'h-full'}"
                        >
                            <SongBrowser
                                bind:item_height
                                columns={browse_columns}
                            />
                        </div>

                        <div
                            class="absolute h-full w-full left-0 top-0 -z-50 brightness-75"
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
                            class="absolute w-full h-full left-0 top-0 -z-50 overflow-hidden object-cover brightness-50 blur-xl"
                            style={`scale: ${
                                100 * Math.max(img_w / img_h, 1) + 10
                            }%;`}
                            src={img_src}
                            alt=""
                            on:error={on_img_err}
                        />
                    </div>
                </div>
            </browse>
        </search-area>

        {#if !mobile}
            <queue-area class="h-full">
                <div
                    class="flex flex-col"
                    style={$player_type == "YtVideoPlayer"
                        ? "height: calc(100% - calc(var(--queue-area-width) * 9 / 16));"
                        : "height: 100%;"}
                >
                    <Queue bind:item_height {mobile} />
                </div>
                {#if $player_type == "YtVideoPlayer"}
                    <div
                        class="rounded-2xl overflow-hidden mt-2 mr-4 flex-none aspect-video"
                    >
                        <Video />
                    </div>
                {/if}
            </queue-area>
        {/if}
    </all-contents>

    <play-bar class="px-2">
        <PlayBar {mobile} keyboard_control={playbar_kb_controls} />
    </play-bar>

    <div class="w-full h-full absolute -z-[60] brightness-50">
        <BlobBg />
    </div>

    <!-- grain applies over both the bg and the song-browser image cuz of z-index i think -->
    <div class="-z-40 grainy grainy-bg" />
</div>

<!--
z index notes
- -z-70: forbidden things
- -z-60: blob bg
- -z-50: bg blob, bg image
- -z-40: grain
- -z-10: prompt blur bg
-  z-10: volume slider, 3 dot menu
-  z-20: things covering z-10
-->

{#if $player_type == "YtPlayer" || ($player_type == "YtVideoPlayer" && mobile)}
    <div class="absolute -z-[70] left-8 aspect-video bottom-28 w-80">
        <Video />
    </div>
{/if}
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
