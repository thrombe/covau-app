<script lang="ts">
    import { onDestroy } from "svelte";
    import AudioListItem from "$lib/components/AudioListItem.svelte";
    import ProgressBar from "$lib/components/ProgressBar.svelte";
    import * as stores from "$lib/stores.ts";
    import { exhausted } from "$lib/utils.ts";
    import { get, type Writable } from "svelte/store";
    import * as icons from "$lib/icons.ts";
    import type { QueueManager } from "./queue.ts";
    import type { PlayerMessage } from "$types/server.ts";
    import * as utils from "$lib/utils.ts";

    export let mobile = false;
    export let keyboard_control = true;

    let playing_item = stores.playing_item;

    let player = stores.player;
    let queue = stores.queue as Writable<QueueManager>;

    let has_started = false;
    let video_pos = 0;
    // let has_prev = $queue.has_prev();
    // let has_next = $queue.has_next();
    let is_playing = false;
    let audio_duration = 0;
    let is_muted = false;
    let volume = 1;
    const handler = async (m: PlayerMessage) => {
        switch (m.type) {
            case "Paused":
                is_playing = false;
                break;
            case "Unpaused":
                is_playing = true;
                break;
            case "Finished":
                is_playing = false;
                if (await $queue.has_next()) {
                    await $queue.play_next();
                } else {
                    $queue.finished();
                }
                queue.update((q) => q);
                break;
            case "Playing":
                is_playing = true;
                has_started = true;
                break;
            case "ProgressPerc":
                break;
            case "Volume":
                volume = m.content;
                break;
            case "Duration":
                audio_duration = m.content;
                break;
            case "Mute":
                is_muted = m.content;
                break;
            case "Error":
                break;
            default:
                throw exhausted(m);
        }
        if (m.type != "ProgressPerc") {
            return;
        }
        video_pos = m.content;
    };
    let unsub = player.subscribe((pl) => {
        if (!pl) {
            return;
        }
        pl.on_message(handler);
    });
    onDestroy(unsub);

    const on_seek = async (p: number) => {
        $player.seek_to_perc(p);
    };

    const on_volume_change = async (v: number) => {
        $player.set_volume(v);
        volume = v;
    };

    $: fmt_duration = utils.fmt_time(audio_duration);
    $: fmt_video_pos = utils.fmt_time(video_pos * audio_duration);

    let dragging_volume = false;

    let volume_icon: "max" | "mid" | "min" = "max";

    $: if (volume) {
        if (volume < 1 / 3) {
            volume_icon = "min";
        } else if (volume < 2 / 3) {
            volume_icon = "mid";
        } else {
            volume_icon = "max";
        }
        if (is_muted) {
            volume_icon = "min";
        }
    }

    const _on_keydown = async (event: KeyboardEvent) => {
        if (!keyboard_control || document.activeElement?.tagName == "INPUT") {
            return;
        }

        if (event.key == " ") {
            if (has_started) {
                $player.toggle_pause();
            } else {
                $player.play_item(get(playing_item));
                has_started = true;
            }
        } else if (event.key == "ArrowLeft" || event.key == "h") {
            await $player.seek_by(-10);
        } else if (event.key == "ArrowRight" || event.key == "l") {
            await $player.seek_by(10);
        } else if (event.key == "ArrowDown" || event.key == "j") {
            await $queue.play_next();
            queue.update((q) => q);
        } else if (event.key == "ArrowUp" || event.key == "k") {
            await $queue.play_prev();
            queue.update((q) => q);
        } else if (event.key == "m") {
            $player.toggle_mute();
        }
    };
</script>

<div
    class="flex flex-row h-full"
    style="
        --volume-control-width: 3.5rem;
        --audio-info-width: {mobile ? '0px' : '20rem'};
    "
>
    <audio-info class="flex flex-row {mobile ? 'hidden' : ''}">
        <AudioListItem item={$playing_item} ctx="Playbar" show_buttons={true} />
    </audio-info>

    <audio-controls class="pt-4 pb-2">
        <div class="flex flex-row items-center h-1/3 w-full py-1">
            <div class="p-2 text-gray-400 select-none">
                {fmt_video_pos}
            </div>
            <ProgressBar
                bind:progress={video_pos}
                onchange={on_seek}
                thumb_width={15}
                thumb_height={15}
            />
            <div class="p-2 text-gray-400 select-none">
                {fmt_duration}
            </div>
        </div>

        <div class="flex flex-row gap-2 justify-center h-2/3">
            <!-- - [clicks are painful sometimes](https://css-tricks.com/when-a-click-is-not-just-a-click/) -->
            <button
                on:pointerup={async () => {
                    await $queue.play_prev();
                    queue.update((q) => q);
                }}
            >
                <img alt="prev" class="h-3" src={icons.prev} />
            </button>
            <button
                on:pointerup={async () => {
                    if (has_started) {
                        $player.toggle_pause();
                    } else {
                        $player.play_item($playing_item);
                    }
                    is_playing = $player.is_playing();
                    has_started = true;
                }}
            >
                <img
                    alt="play pause"
                    class="h-3"
                    src={is_playing ? icons.pause : icons.play}
                />
            </button>
            <button
                on:pointerup={async () => {
                    await $queue.play_next();
                    queue.update((q) => q);
                }}
            >
                <img alt="next" class="h-3" src={icons.next} />
            </button>
        </div>
    </audio-controls>

    <volume-control
        class="relative flex flex-row justify-center items-center pb-1"
    >
        <button class="volume-button p-2">
            <img
                alt="volume icon"
                class="h-6 {is_muted ? 'brightness-50 opacity-50' : ''}"
                src="/static/volume-{volume_icon}.svg"
            />
            <div
                class="volume-box absolute flex flex-row gap-4 right-0 bottom-10 h-16 px-6 py-4 mr-2 bg-gray-200 bg-opacity-10 rounded-xl backdrop-blur-md {dragging_volume
                    ? 'z-10'
                    : '-z-[70] opacity-0'}"
            >
                <div
                    class="relative h-full w-40 py-3 {is_muted
                        ? 'brightness-50'
                        : ''}"
                >
                    {#if is_muted}
                        <div
                            class="absolute block z-20 w-full h-full left-0 top-0"
                        />
                    {/if}
                    <ProgressBar
                        bind:progress={volume}
                        onchange={on_volume_change}
                        thumb_width={20}
                        thumb_height={20}
                        bind:dragging={dragging_volume}
                    />
                </div>
                <button
                    class="p-2"
                    on:pointerup={async () => {
                        is_muted = !is_muted;
                        $player.toggle_mute();
                    }}
                >
                    <img
                        alt="volume icon"
                        class="h-full w-6 aspect-square {is_muted
                            ? 'brightness-50 opacity-50'
                            : ''}"
                        src="/static/volume-{volume_icon}.svg"
                    />
                </button>
            </div>
        </button>
    </volume-control>
</div>

<svelte:window on:keydown={_on_keydown} />

<style lang="postcss">
    audio-info {
        width: var(--audio-info-width);
    }

    audio-controls {
        width: calc(
            100% - var(--audio-info-width) - var(--volume-control-width)
        );
    }

    button {
        @apply rounded-lg text-gray-200 font-bold bg-gray-200 bg-opacity-10;
    }

    audio-controls button {
        @apply px-2 my-1;
    }

    .volume-button:hover .volume-box,
    .volume-box:hover {
        @apply z-10 opacity-100;
        transition: 0s;
    }
    .volume-button .volume-box,
    .volume-box {
        transition-delay: 0.7s;
    }

    volume-control {
        width: var(--volume-control-width);
    }
</style>
