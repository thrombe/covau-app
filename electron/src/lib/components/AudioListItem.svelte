<script lang="ts">
    import type { ListItem, RenderContext } from "$lib/searcher/item";
    import ThreeDotMenu from "./ThreeDotMenu.svelte";
    import * as icons from "$lib/icons.ts";

    export let item: ListItem;
    export let ctx: RenderContext;
    export let show_buttons = false;
    export let alt_thumbnail: string | null = null;

    // TODO: somehow setup retrying and see if images load more reliably

    $: img_src = item?.thumbnail() ?? alt_thumbnail ?? item?.default_thumbnail() ?? "";
    $: options = item?.options(ctx) ?? [];

    let hide_border = true;

    $: if (img_src || true) {
        if (img_src == "") {
            hide_border = true;
        }
    }

    const on_err = async () => {
        hide_border = true;
        img_src = item.default_thumbnail();
    };

    const on_load = async () => {
        hide_border = false;
    };
</script>

<item class="w-full h-full block relative py-1"
    class:show-buttons={show_buttons}
>
    <div class="w-full h-full pl-1 flex flex-row text-gray-200">
        <icon class="block p-1 aspect-square flex-none h-full">
            <div class="w-full h-full rounded-md overflow-hidden">
                <img
                    class="w-full h-full object-cover {hide_border
                        ? 'scale-150'
                        : ''}"
                    src={img_src}
                    draggable={false}
                    alt=""
                    on:error={on_err}
                    on:load={on_load}
                />
            </div>
        </icon>

        <info class="flex flex-col mx-2 overflow-hidden pt-1">
            <item-title class="flex flex-col justify-end h-1/2 text-sm">
                <txt>{item?.title() ?? ""}</txt>
            </item-title>

            <item-title-sub
                class="flex flex-col justify-start h-1/2 text-xs text-gray-400"
            >
                <txt>{item?.title_sub() ?? ""}</txt>
            </item-title-sub>
        </info>
    </div>

    {#each options as option}
        {#if option.location == "TopRight"}
            <button class="pop-button top-0" on:click={option.onclick}>
                <img
                    alt="remove"
                    draggable={false}
                    class="h-3 opacity-50"
                    src={option.icon}
                />
            </button>
        {:else if option.location == "IconTop"}
            <div
                class="absolute h-full flex flex-col justify-center left-0 top-0"
            >
                <button
                    class="queue-button"
                    class:play-button={true}
                    on:click={option.onclick}
                >
                    <img
                        alt="play"
                        draggable={false}
                        class="scale-[50%]"
                        src={option.icon}
                    />
                </button>
            </div>
        {:else if option.location == "BottomRight"}
            <button class="pop-button bottom-0" on:click={option.onclick}>
                <img
                    alt="remove"
                    draggable={false}
                    class="h-3 opacity-50"
                    src={option.icon}
                />
            </button>
        {/if}
    {/each}

    {#if options.length > 0}
        <div class="relative">
            <ThreeDotMenu
                options={options}
                let:show_menu
                let:on_menu_click
            >
                <button
                    class="pop-button bottom-0 menu-button"
                    on:click={on_menu_click}
                    class:menu-open={show_menu}
                >
                    <img alt="three dot menu icon" class="h-3 w-3" src={icons.three_dot_menu} />
                </button>
            </ThreeDotMenu>
        </div>
    {/if}
</item>

<style lang="postcss">
    item button {
        display: none;
    }
    item:hover button,
    item.show-buttons button {
        display: block;
    }

    .pop-button {
        @apply absolute p-1 m-2 rounded-md bg-gray-200 bg-opacity-30 text-gray-900 font-bold right-0;
    }
    .queue-button {
        @apply aspect-square h-full scale-[50%] rounded-md bg-gray-600 bg-opacity-50 text-xl text-gray-900 font-bold;
    }
</style>
