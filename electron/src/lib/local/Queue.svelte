<script lang="ts">
    import AudioListItem from '$lib/components/AudioListItem.svelte';
    import type { ListItem } from '$lib/searcher/item.ts';
    import { onDestroy, tick } from 'svelte';
    import type { Unique } from '../virtual';
    import VirtualScrollable from '$lib/components/VirtualScrollable.svelte';
    import { toast } from '$lib/toast/toast.ts';
    import { queue_searcher } from '$lib/stores.ts';

    export let item_height: number;
    export let selected_item_index: number;
    export let playing: number | null;
    export let playing_video_info: ListItem | null = null;
    export let on_item_add: (id: string) => Promise<void>;
    export let dragend = (e: DragEvent) => {
        hovering = null;
        dragging_index = null;
    };
    export let move_item = async (from: number, to: number) => {};
    export let insert_item = async (index: number, id: string) => {};
    export let delete_item = async (index: number, id: string) => {};
    export let play_item = async (index: number) => {};
    export let mobile = false;

    $: if (playing !== null) {
        update_playing_vid_info();
    }

    const update_playing_vid_info = () => {
        // if (
        //     playing !== null &&
        //     (playing_video_info === null || (playing_video_info &&
        //         playing_video_info.id !== items[playing].data))
        // ) {
        //     let vid = searched_item_map.get(items[playing].data);
        //     playing_video_info = vid ?? null;
        // }
    };

    export let items: Unique<ListItem, string>[] = [];

    let end_is_visible = false;
    const end_reached = async () => {
        while (true) {
            if (!end_is_visible || !$queue_searcher.has_next_page) {
                break;
            }
            await next_page();
            await tick();
            await new Promise<void>((r) => setTimeout(() => r(), 100));
            await tick();
        }
    };
    const next_page = async () => {
        let r = await $queue_searcher.next_page();
        items = r.map(e => ({ id: e.key(), data: e })) as typeof items;
    };
    export const search_objects = async () => {
        await next_page();
        await tick();
        selected_item_index = 0;
        await try_scroll_selected_item_in_view();
        end_reached();
    };

    let unsub = queue_searcher.subscribe(async (e) => {
        items = [];
        if (search_objects) {
            await search_objects();
        }
    });
    onDestroy(unsub);

    const on_item_click = async (t: Unique<ListItem, unknown>) => {};
    let selected_item: Unique<ListItem, unknown>;
    let try_scroll_selected_item_in_view: () => Promise<void>;

    let hovering: number | null = null;
    let dragging_index: number | null = null;
    const drop = async (event: DragEvent, target: number) => {
        dragend(event);
        event.dataTransfer!.dropEffect = 'move';

        if (event.dataTransfer?.getData('covau/dragndrop')) {
            let start_index = parseInt(event.dataTransfer.getData('covau/dragndrop'));

            await move_item(start_index, target);
        } else if (event.dataTransfer?.getData('covau/dragndropnew')) {
            let new_id = event.dataTransfer.getData('covau/dragndropnew');

            await insert_item(target, new_id);
        }
    };

    // can't drag items and scroll at the same time. bummer
    const dragstart = (event: DragEvent, i: number) => {
        event.dataTransfer!.effectAllowed = 'move';
        event.dataTransfer!.dropEffect = 'move';
        dragging_index = i;
        event.dataTransfer!.setData('covau/dragndrop', i.toString());
    };

    const dragenter = (e: DragEvent, index: number) => {
        if (!!e.dataTransfer?.getData('covau/ignore')) {
            return;
        }
        if (items.length > index) {
            hovering = index;
        } else {
            // if it is input bar - select the thing above it
            hovering = index - 1;
        }
    };
</script>

<div class='w-full h-full'>
    <VirtualScrollable
        bind:items={items}
        columns={1}
        {item_height}
        {on_item_click}
        {end_reached}
        bind:try_scroll_into_view={try_scroll_selected_item_in_view}
        keyboard_control={false}
        bind:selected={selected_item_index}
        bind:end_is_visible
        bind:selected_item
        let:item
        let:selected
        let:index
    >
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <item class='w-full h-full block relative rounded-xl'
            draggable={index != items.length}
            on:dragstart={(event) => dragstart(event, index)}
            on:drop|preventDefault={(event) => drop(event, index)}
            on:dragend={dragend}
            ondragover="return false"
            on:dragenter={(e) => dragenter(e, index)}
            class:is-active={hovering === index && items.length != index}
            class:is-dragging={dragging_index === index}
            class:is-playing={index === playing}
            class:is-selected={selected}
        >
            <AudioListItem
                item={item}
                ctx="Queue"
            />
            <!-- <button
                class='pop-button'
                on:click={async () => {
                    // await delete_item(index, items[index].data);
                }}
            >
                <img alt="remove" draggable={false} class='h-3 opacity-50' src='/static/remove.svg'>
            </button>
            <div class='absolute h-full flex flex-col justify-center left-0 top-0'>
                <button
                    class='queue-button'
                    class:play-button={true}
                    on:click={async () => {
                        await play_item(index);
                    }}
                >
                    <img alt="play" draggable={false} class='scale-[50%]' src='/static/play.svg'>
                </button>
            </div> -->
        </item>
    </VirtualScrollable>
</div>

<style lang='postcss'>
    item.is-dragging {
        @apply opacity-40;
    }
    item.is-selected, item:hover {
        @apply bg-gray-200 bg-opacity-10;
    }
    item.is-playing {
        @apply bg-gray-200 bg-opacity-20;
    }
    item.is-active {
        @apply bg-green-400 bg-opacity-20;
    }
    item:hover button, .is-selected button {
        display: block;
    }

    .pop-button {
        @apply absolute p-1 m-2 rounded-md bg-gray-200 bg-opacity-30 text-gray-900 font-bold right-0 top-0;
    }
    .queue-button {
        @apply aspect-square h-full scale-[50%] rounded-md bg-gray-600 bg-opacity-50 text-xl text-gray-900 font-bold;
    }

    item button {
        display: none;
    }
    item button.play-button {
    }
</style>
