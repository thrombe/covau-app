<script lang="ts">
    import type { ListItem } from "$lib/searcher/item.ts";
    import { type Readable } from "svelte/store";
    import AudioListItem from "./AudioListItem.svelte";
    import Explorer from "./Explorer.svelte";
    import * as stores from "$lib/stores.ts";

    export let item: Readable<ListItem>;
    export let updater: Readable<number>;

    $: img_src = $item?.thumbnail() ?? $item?.default_thumbnail() ?? "";
    $: sections = $item?.sections() ?? [];
    $: thumbnail = $item.thumbnail() ?? null;

    let hide_border = true;
    const on_err = async () => {
        hide_border = true;
        img_src = $item.default_thumbnail();
    };

    const on_load = async () => {
        hide_border = false;
    };

    const disable_space_to_scroll = (k: KeyboardEvent) => {
        if (document.activeElement?.tagName == "INPUT") {
            return;
        }
        if (k.key == " ") {
            k.preventDefault();
        }
    };

    let img_w: number = 1;
    let img_h: number = 1;
</script>

<svelte:window on:keydown={disable_space_to_scroll} />

<div class="h-full w-full pb-4 flex flex-row">
    <div
        class="flex flex-col px-4 pt-4 place-items-center w-full h-full overflow-y-auto overflow-x-auto scrollbar-hide"
    >
        <div class="flex flex-col gap-4 w-full md:max-w-[60rem]">
            {#each sections as section}
                {#if section.type == "Info"}
                    <div class="flex flex-row gap-4">
                        {#if thumbnail != null}
                            <img
                                class="h-56 w-56 rounded-xl object-cover {hide_border
                                    ? 'scale-150'
                                    : ''}"
                                src={thumbnail}
                                draggable={false}
                                alt=""
                                on:error={on_err}
                                on:load={on_load}
                            />
                        {/if}
                        <div class="flex flex-col">
                            {#each section.info as info}
                                <div class="flex flex-row">
                                    <div class="heading">
                                        {`${info.heading}: `}
                                    </div>
                                    <div class="content">
                                        {info.content}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {:else if section.type == "Options"}
                    <div class="flex flex-col">
                        <div class="w-full heading">
                            {section.title}
                        </div>
                        <div class="flex flex-row flex-wrap gap-2">
                            {#each section.options as option}
                                <button on:pointerup={option.onclick}>
                                    <div
                                        class="flex flex-row rounded-md p-2 pr-4 place-items-center bg-gray-100 bg-opacity-10 hover:bg-gray-100 hover:bg-opacity-15"
                                    >
                                        <img
                                            alt={option.title}
                                            class="h-4 w-4 m-1 mr-4"
                                            src={option.icon}
                                        />

                                        <div
                                            class="flex flex-col justify-end text-sm text-gray-200"
                                        >
                                            <div
                                                class="w-full text-ellipsis whitespace-nowrap overflow-hidden select-none"
                                            >
                                                {option.title}
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            {/each}
                        </div>
                    </div>
                {:else if section.type == "Rearrange"}
                    <div class="flex flex-col">
                        <div class="w-full heading">
                            {section.title}
                        </div>
                        {#each section.items as item (item.get_key())}
                            <div class="h-20">
                                <AudioListItem ctx={"Browser"} {item} />
                            </div>
                        {/each}
                    </div>
                {:else if section.type == "Searcher"}
                    <div class="flex flex-col">
                        <div class="w-full heading">
                            {section.title}
                        </div>
                        <div
                            class="w-full flex flex-row flex-grow-0 px-2"
                            style={`height: ${80 * section.height}px;`}
                        >
                            <Explorer
                                searcher={section.searcher}
                                updater={updater}
                                source_key={stores.new_key()}
                                columns={1}
                                item_height={80}
                                keyboard_control={false}
                                let:item
                                let:selected
                                let:index
                                let:hovering
                                let:dragging_index
                                let:dragstart
                                let:dragenter
                            >
                                <!-- svelte-ignore a11y-no-static-element-interactions -->
                                <list-item
                                    class="w-full h-full rounded-xl"
                                    class:selected
                                >
                                    <div
                                        class="item w-full h-full rounded-xl"
                                        draggable={true}
                                        on:dragstart={() => dragstart(index, item)}
                                        on:drop|preventDefault={stores.drag_ops.drop}
                                        on:dragend={stores.drag_ops.dragend}
                                        ondragover="return false"
                                        on:dragenter={() => dragenter(index)}
                                        class:selected
                                        class:is-active={hovering === index}
                                        class:is-dragging={dragging_index === index}
                                        class:is-selected={selected}
                                    >
                                        <AudioListItem
                                            {item}
                                            ctx="Browser"
                                            show_buttons={selected}
                                        />
                                    </div>
                                </list-item>
                            </Explorer>
                        </div>
                    </div>
                {:else if section.type == "PrettyJson"}
                    <div class="flex flex-col">
                        <div class="w-full heading">
                            {section.title}
                        </div>
                        <div
                            class="w-full text-sm whitespace-pre overflow-hidden text-ellipsis selection:bg-gray-200 selection:bg-opacity-20"
                        >
                            {section.content}
                        </div>
                    </div>
                {:else}
                    <div class="w-full">
                        section type {section.type} not handled
                    </div>
                {/if}
            {/each}
        </div>
    </div>
</div>

<div
    class="absolute w-full h-full -z-[70]"
    bind:clientWidth={img_w}
    bind:clientHeight={img_h}
/>
<img
    class="absolute w-full h-full left-0 top-0 -z-[49] overflow-hidden object-cover brightness-50 blur-2xl"
    style={`scale: ${100 * Math.max(img_w / img_h, 1) + 10}%;`}
    src={img_src}
    alt=""
    on:error={on_err}
/>

<style lang="postcss">
    .heading {
        @apply block text-xl font-bold text-gray-400 whitespace-pre select-none;
    }
    .content {
        @apply inline-block text-xl text-gray-200 overflow-hidden text-ellipsis text-nowrap selection:bg-gray-200 selection:bg-opacity-20;
    }

    list-item:hover .item,
    .selected .item {
        @apply bg-gray-200 bg-opacity-10;
    }
    .is-dragging {
        @apply opacity-40;
    }
    .is-selected {
        @apply bg-gray-200 bg-opacity-10;
    }
    .is-active, .is-selected.is-active {
        @apply bg-green-400 bg-opacity-20;
    }

    .scrollbar-hide::-webkit-scrollbar {
        display: none;
    }
    /* For IE, Edge and Firefox */
    .scrollbar-hide {
        -ms-overflow-style: none; /* IE and Edge */
        scrollbar-width: none; /* Firefox */
    }
</style>
