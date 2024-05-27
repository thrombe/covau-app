<script lang="ts">
    import { SyncPlayer } from '../lib/player';
    import { initializeApp } from 'firebase/app';
    import { getFirestore } from 'firebase/firestore';
    import { onDestroy } from 'svelte';
    import { writable, type Writable } from 'svelte/store';
    import { firebase_config } from '../firebase_config';
    import { new_innertube_instance } from '$lib/searcher/tube';
    import { YT, YTNodes } from '$lib/searcher/song_tube';
    import { Player as PL } from 'youtubei.js';
    import { LocalPlayer } from "$lib/local_player.ts";

    export let params: { group?: string };

    let lp = new LocalPlayer();

    const dothis = async () => {
        let p = await new_innertube_instance();
        let res = await p.music.search("Aimer", { type: 'song' });
        console.log(res)
        let contents = res.contents!
            .flatMap(e => e.contents?.filterType(YTNodes.MusicResponsiveListItem) ?? []);
        let v = contents[0];
        console.log(v)

        let d = await p.getInfo(v.id!);
        console.log(d)
        let f = d.chooseFormat({ type: 'audio', quality: 'best', format: 'opus', client: 'YTMUSIC_ANDROID' });
        let url = d.getStreamingInfo();
        console.log(url, url, f, f.decipher(p.session.player))
        p.download
    };
    
    let group: string;
    if (!params.group) {
        group = 'random-one';
        params.group = group;
        window.history.pushState({}, '', '#/play/' + group);
    } else {
        group = params.group;
    }

    $: if (group != params.group) {
        let url_without_hash =  window.location.toString().replace(window.location.hash, '');
        let new_url = url_without_hash + '#/play/' + params.group;
        window.location.replace(new_url);
        window.location.reload();
    }

    let app = initializeApp(firebase_config);
    let db = getFirestore(app);
    let player: Writable<SyncPlayer>;

    onDestroy(async () => {
        if (player) {
            await $player.destroy();
        }
    });

    let tick = writable(0);
    const on_yt_load = async () => {
        let p = await SyncPlayer.new(db, group, 'video');
        player = writable(p);
        await dothis();
        $player.on_update = () => {
            $tick += $player.synced_data.tick;
        };
    };

    (window as any).onYouTubeIframeAPIReady = on_yt_load;

    let id_input_val: string;

    let video: any;
    let queue = new Array<string>();
    $: if ($tick) {
        console.log($player.synced_data);
        queue = $player.synced_data.queue;
        console.log(queue);
    }

    let now_time = 0;
    setInterval(() => {
        now_time = Date.now();
    }, 300);
</script>

<svelte:head>
    <script src="https://www.youtube.com/iframe_api"></script>
</svelte:head>

<input bind:value={id_input_val} />
<button
    on:click={async () => {
        await $player.queue(id_input_val);
    }}>queue</button
>
<button on:click={() => $player.play()}>play</button>
<button on:click={() => $player.play_next()}>next</button>
<button on:click={() => $player.toggle_pause()}>toggle pause</button>
<button on:click={() => $player.recalculate_time_error()}>resync</button>
<button on:click={() => on_yt_load()}>reload player</button>

<span>{now_time.toString().slice(8, 10)}</span>
{#if player}
    {#key $tick}
        {#each queue as id, i (i)}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <span
                on:click={async () => {
                    await $player.play_index(i);
                }}
                on:keydown={() => {}}>{id}</span
            >
        {/each}
    {/key}
{/if}

<div class="video-parent">
    <div class="video" bind:this={video} id="video" />
    <div class="video-sibling" />
</div>

<style>
    .video {
        display: block;
        position: relative;
        width: 100%;
        height: 100%;
    }

    .video-sibling {
        display: block;
        position: absolute;
        left: 0px;
        top: 0px;
        width: 100%;
        height: 100%;
        background-color: #00ff0000;
        z-index: 2;
    }

    .video-parent {
        position: fixed;
        right: 0px;
        bottom: 0px;

        width: 300px;
        height: 150px;
    }
</style>
