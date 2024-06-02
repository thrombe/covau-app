<script lang="ts">
    import { new_innertube_instance } from '$lib/searcher/tube.ts';
    import Loading from '$lib/components/Loading.svelte';
    import Vibe from './Vibe.svelte';
</script>

{#await new_innertube_instance()}
    <Loading />
{:then tube}
    <Vibe {tube} />
{/await}
