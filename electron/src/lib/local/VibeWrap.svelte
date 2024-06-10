<script lang="ts">
    import { new_innertube_instance } from '$lib/searcher/tube.ts';
    import Loading from '$lib/components/Loading.svelte';
    import Vibe from './Vibe.svelte';
    import { tube } from "$lib/stores.ts";
    import * as wasm from "$wasm/covau_app_wasm";

    let promise = (async () => {
        let itube = await new_innertube_instance();
        tube.set(itube);

        let _info = await wasm.default();
    })()
</script>

{#await promise}
    <Loading />
{:then}
    <Vibe />
{/await}
