<script lang="ts">
    import { new_innertube_instance } from '$lib/searcher/tube.ts';
    import Loading from '$lib/components/Loading.svelte';
    import Vibe from './Vibe.svelte';
    import { tube } from "$lib/stores.ts";


    let itube_promise = new_innertube_instance();
    (async () => {
        let itube = await itube_promise;
        tube.set(itube);
    })()
</script>

{#await itube_promise}
    <Loading />
{:then}
    <Vibe />
{/await}
