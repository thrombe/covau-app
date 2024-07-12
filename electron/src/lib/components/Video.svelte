<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import * as icons from "$lib/icons.ts";
    import { YtPlayer } from '$lib/player/yt.ts';
    import { player as player_ } from "$lib/stores.ts";
    import type { Writable } from 'svelte/store';

    let player: Writable<YtPlayer> = player_ as unknown as Writable<YtPlayer>;

    onDestroy(async () => {
        if ($player) {
            $player.destroy();
        }
    });

    const load_player = async () => {
        if ($player) {
            $player.destroy();
        }
        let p = await YtPlayer.new('video');
        $player = p;
    };
    onMount(() => {
        load_player();
    });

    let waiting = true;
    let interval = setInterval(() => {
        if (waiting) {
            if ($player && $player.player && $player.player.getPlayerState) {
                waiting = $player.player.getPlayerState() !== YT.PlayerState.PLAYING;
            }
        } else {
            clearInterval(interval);
        }
    }, 400);
    const on_click = async (e: Event) => {
        if ($player) {
            $player.play();
        }
        // if button is clicked even before player is loaded - it should still work fine as all it needs
        // is some kind of user interaction with the page for it to start the video
        waiting = false;
    };
</script>

<div class="relative h-full w-full">
    <div class="block w-full h-full" id="video" />
    <div class="block absolute left-0 top-0 w-full h-full opacity-0 z-10" />
    <div class="absolute left-0 top-0 flex flex-col h-full w-full z-10 items-center justify-center {waiting ? '' : 'hidden'}">
        <button
            class='py-3 px-6 rounded-2xl bg-[#513A61] h-20 text-lg font-bold text-center select-none'
            on:pointerup={on_click} on:keydown={() => {}}
        >
            <img alt="play" class='h-full' src={icons.play}>
        </button>
    </div>
</div>
