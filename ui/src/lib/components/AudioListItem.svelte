<script lang="ts">
    import type { ListItem, RenderContext } from "$lib/searcher/item.ts";
    import ThreeDotMenu from "./ThreeDotMenu.svelte";
    import * as icons from "$lib/icons.ts";
    import * as utils from "$lib/utils.ts";
    import Tooltip from "$lib/tooltip/Tooltip.svelte";

    export let item: ListItem;
    export let ctx: RenderContext;
    export let show_buttons = false;
    export let alt_thumbnail: string | null = null;

    // TODO: somehow setup retrying and see if images load more reliably

    $: img_src =
        item?.thumbnail() ?? alt_thumbnail ?? item?.default_thumbnail() ?? "";
    $: options = item?.options(ctx) ?? [];

    let hide_border = false;

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

<item
    class="w-full h-full block relative py-1"
    class:show-buttons={show_buttons}
>
    <div class="w-full h-full pl-1 flex flex-row text-gray-200">
        <div class="block p-1 aspect-square flex-none h-full">
            <div class="w-full h-full rounded-md overflow-hidden">
                <img
                    class={`w-full h-full object-cover ${
                        hide_border ? "scale-150" : ""
                    }`}
                    src={img_src}
                    draggable={false}
                    alt=""
                    on:error={on_err}
                    on:load={on_load}
                />
            </div>
        </div>

        <div class="flex flex-col mx-2 overflow-hidden pt-1">
            <div class="flex flex-col justify-end h-1/2 text-sm select-none">
                <div class="text-content">
                    {item?.title() ?? ""}
                </div>
            </div>

            <div
                class="flex flex-col justify-start h-1/2 text-xs text-gray-400 select-none"
            >
                <div class="text-content">
                    {item?.title_sub() ?? ""}
                </div>
            </div>
        </div>
    </div>

    {#if options.top_right != null}
        <Tooltip
            tooltip={options.top_right.title}
            let:on_enter
            let:on_leave
        >
            <button
                class="absolute pop-button top-0 right-0 p-1 m-2"
                on:pointerup={utils.wrap_toast(options.top_right.onclick)}
                on:pointerenter={on_enter}
                on:pointerleave={on_leave}
            >
                <img
                    alt="remove"
                    draggable={false}
                    class="h-3 opacity-50"
                    src={options.top_right.icon}
                />
            </button>
        </Tooltip>
    {/if}
    {#if options.icon_top != null}
        <div class="absolute h-full flex flex-col justify-center left-0 top-0">
            <Tooltip
                tooltip={options.icon_top.title}
                let:on_enter
                let:on_leave
            >
                <button
                    class="queue-button"
                    class:play-button={true}
                    on:pointerup={utils.wrap_toast(options.icon_top.onclick)}
                    on:pointerenter={on_enter}
                    on:pointerleave={on_leave}
                >
                    <img
                        alt="play"
                        draggable={false}
                        class="scale-[50%]"
                        src={options.icon_top.icon}
                    />
                </button>
            </Tooltip>
        </div>
    {/if}

    <div class="absolute bottom-0 right-0 flex flex-row gap-1 max-w-[80%] m-2">
        {#each options.bottom as option}
            <Tooltip
                tooltip={option.title}
                let:on_enter
                let:on_leave
            >
                <button
                    class="pop-button p-1"
                    on:pointerup={utils.wrap_toast(option.onclick)}
                    on:pointerenter={on_enter}
                    on:pointerleave={on_leave}
                >
                    <img
                        alt={option.title}
                        draggable={false}
                        class="h-3 w-3 opacity-50"
                        src={option.icon}
                    />
                </button>
            </Tooltip>
        {/each}

        {#if options.menu.length > 0}
            <div class="relative">
                <ThreeDotMenu
                    options={options.menu}
                    let:show_menu
                    let:on_menu_click
                >
                    <Tooltip
                        tooltip={"Options"}
                        let:on_enter
                        let:on_leave
                    >
                        <button
                            class="pop-button bottom-0 right-0 p-1"
                            on:pointerup={on_menu_click}
                            class:menu-open={show_menu}
                            on:pointerenter={on_enter}
                            on:pointerleave={on_leave}
                        >
                            <img
                                alt="three dot menu icon"
                                class="h-3 w-3"
                                src={icons.three_dot_menu}
                            />
                        </button>
                    </Tooltip>
                </ThreeDotMenu>
            </div>
        {/if}
    </div>
</item>

<style lang="postcss">
    item button {
        display: none;
    }
    item:hover button,
    item.show-buttons button {
        display: block;
    }

    .text-content {
        @apply overflow-x-hidden text-ellipsis text-nowrap;
    }

    .pop-button {
        @apply rounded-md hover:bg-gray-200 hover:bg-opacity-30 text-gray-900 font-bold;
    }
    .queue-button {
        @apply aspect-square h-full scale-[50%] rounded-md bg-gray-600 bg-opacity-50 text-xl text-gray-900 font-bold;
    }
</style>
