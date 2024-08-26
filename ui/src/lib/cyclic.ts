
let _imports = async () => ({
    stores: await import("$lib/stores.ts"),
    server: await import("$lib/server.ts"),
    searcher: {
        searcher: await import("$lib/searcher/searcher.ts"),
        db: await import("$lib/searcher/db.ts"),
        item: await import("$lib/searcher/item.ts"),
        mixins: await import("$lib/searcher/mixins.ts"),
        song_tube: await import("$lib/searcher/song_tube.ts"),
        mbz: await import("$lib/searcher/mbz.ts"),
    },
    local: {
        queue: await import("$lib/local/queue.ts"),
        player: await import("$lib/local/player.ts"),
    },
    player: {
        audio: await import("$lib/player/audio.ts"),
        yt: await import("$lib/player/yt.ts"),
    },
});

// @ts-ignore
export let imports: Awaited<ReturnType<typeof _imports>> = null;
export async function init() {
    imports = await _imports();
}

