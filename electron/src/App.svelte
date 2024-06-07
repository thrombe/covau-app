<script lang='ts'>
    import Router from 'svelte-spa-router';
    // Import the list of routes
    import routes from './routes';

    import { set_seed } from '$lib/components/BlobBg.svelte';

    let seed = Date.now().toString();
    set_seed(seed);

    if (import.meta.env.UI_BACKEND === "WEBUI") {
        let webui = document.createElement("script");
        webui.src = `http://localhost:${import.meta.env.WEBUI_PORT}/webui.js`;
        document.head.appendChild(webui);
        webui.onload = (_) => {
            console.log("webui.js loaded :)")
        };
        webui.onerror = (_) => {
            console.log("webui.js NOT loaded :(")
        };
    }
</script>

<Router {routes} />
