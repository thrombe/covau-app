<script lang="ts">
    import { new_innertube_instance } from '$lib/searcher/tube.ts';
    import Loading from '$lib/components/Loading.svelte';
    import Vibe from './Vibe.svelte';
    import * as stores from "$lib/stores.ts";
    import * as server from "$lib/server.ts";
    import * as types from "$types/types.ts";
    import { onDestroy } from 'svelte';
    import * as wasm from "$wasm/covau_app_wasm";

    let promise = (async () => {
        let itube = await new_innertube_instance();
        stores.tube.set(itube);

        // let _info = await wasm.default();

        await server.serve();
        await stores.syncops.load();
    })();
    onDestroy(server.unserve);
</script>

{#await promise}
    <Loading />
{:then}
    <Vibe />
{/await}
