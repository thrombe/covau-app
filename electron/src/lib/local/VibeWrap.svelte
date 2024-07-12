<script lang="ts">
    import { new_innertube_instance } from '$lib/searcher/tube.ts';
    import Loading from '$lib/components/Loading.svelte';
    import Vibe from './Vibe.svelte';
    import { tube } from "$lib/stores.ts";
    import { serve, unserve } from "$lib/server.ts";
    import { onDestroy } from 'svelte';
    import { init_api as init_yt_api } from "$lib/player/yt.ts";
    import Video from '$lib/components/Video.svelte';
    import { exhausted } from '$lib/virtual.ts';
    import * as stores from "$lib/stores.ts";
    import * as wasm from "$wasm/covau_app_wasm";

    let player: "YtPlayer" | "Musiplayer" = "YtPlayer";

    // :/
    if (1 > 3) {
        player = "Musiplayer";
    }

    let promise = (async () => {
        let itube = await new_innertube_instance();
        tube.set(itube);

        // let _info = await wasm.default();

        switch (player) {
            case "YtPlayer": {
                let stat = await init_yt_api();
                console.log(stat);
            } break;
            case "Musiplayer": {
                let musiplayer = await import("$lib/local/player.ts");
                let pl = new musiplayer.Musiplayer();
                stores.player.set(pl);
            } break;
            default:
                throw exhausted(player);
        }

        let _ = serve();
    })();
    onDestroy(unserve);
</script>

{#await promise}
    <Loading />
{:then}
    <Vibe />

    {#if player == "YtPlayer"}
        <div class="absolute -z-[70] left-8 aspect-video bottom-28 w-80">
            <Video />
        </div>
    {/if}
{/await}
