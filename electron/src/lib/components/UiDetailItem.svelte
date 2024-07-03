<script lang="ts">
    import type { DetailItem } from "$lib/searcher/item.ts";
    import type { Readable } from "svelte/store";
    import AudioListItem from "./AudioListItem.svelte";
    import Explorer from "./Explorer.svelte";

    export let item: Readable<DetailItem>;

    $: img_src = $item?.thumbnail() ?? $item?.default_thumbnail() ?? "";
    $: sections = $item?.sections() ?? [];

    let hide_border = true;
    const on_err = async () => {
        hide_border = true;
        img_src = $item.default_thumbnail();
    };

    const on_load = async () => {
        hide_border = false;
    };

    let img_w: number = 1;
    let img_h: number = 1;
</script>

<div class="h-full w-full p-4 flex flex-row place-content-center">
    <div class="flex flex-col max-w-[80rem] h-full gap-4 overflow-y-auto overflow-x-hidden scrollbar-hide">
        {#each sections as section}
            {#if section.type == "SongInfo"}
                <div class="flex flex-row gap-4">
                    <img
                        class="h-56 w-56 rounded-xl object-cover {hide_border
                            ? 'scale-150'
                            : ''}"
                        src={$item?.thumbnail() ?? ""}
                        draggable={false}
                        alt=""
                        on:error={on_err}
                        on:load={on_load}
                    />
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
                            <button on:click={option.onclick}>
                                <div
                                    class="flex flex-row rounded-md p-2 pr-8 bg-gray-100 bg-opacity-10 hover:bg-gray-100 hover:bg-opacity-15"
                                >
                                    <img
                                        alt={option.title}
                                        class="h-4 w-4 m-1 mr-4"
                                        src={option.icon}
                                    />

                                    <div
                                        class="flex flex-col justify-end h-1/2 text-sm text-gray-200"
                                    >
                                        <div class="w-full text-ellipsis whitespace-nowrap overflow-hidden select-none">
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
                            <AudioListItem
                                ctx={"Browser"}
                                item={item}
                            />
                        </div>
                    {/each}
                </div>
            {:else if section.type == "Searcher"}
                <div class="flex flex-col">
                    <div class="w-full heading">
                        {section.title}
                    </div>
                    <div class="w-full flex flex-row flex-grow-0 px-2" style={`height: ${80 * section.height}px;`}>
                        <Explorer
                            searcher={section.searcher}
                            columns={1}
                            item_height={80}
                            keyboard_control={false}
                            try_scroll_selected_item_in_view={async () => {}}
                            on_item_click={async (t) => {
                                console.log(t);
                            }}
                            let:item
                            let:selected
                        >
                            <!-- svelte-ignore a11y-no-static-element-interactions -->
                            <list-item class:selected>
                                <div
                                    draggable={true}
                                    class="item-bg"
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
                    <div class="w-full text-sm whitespace-pre overflow-hidden text-ellipsis">
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

<div class="absolute w-full h-full -z-[70]" bind:clientWidth={img_w} bind:clientHeight={img_h}></div>
<img
    class="absolute w-full h-full left-0 top-0 -z-[49] overflow-hidden object-cover brightness-50 blur-2xl"
    style={`scale: ${100 * Math.max(img_w / img_h, 1) + 10}%;`}
    src={img_src}
    alt=""
    on:error={on_err}
/>

<style lang="postcss">
    .heading {
        @apply block text-xl font-bold text-gray-400 whitespace-pre;
    }
    .content {
        @apply block text-xl text-gray-200 overflow-hidden text-ellipsis;
    }


    .item-bg {
        @apply w-full h-full;
    }
    list-item:hover .item-bg,
    .selected .item-bg {
        @apply bg-gray-200 bg-opacity-10 rounded-xl;
    }

    .scrollbar-hide::-webkit-scrollbar {
        display: none;
    }
    /* For IE, Edge and Firefox */
    .scrollbar-hide {
        -ms-overflow-style: none;  /* IE and Edge */
        scrollbar-width: none;  /* Firefox */
    }
</style>

