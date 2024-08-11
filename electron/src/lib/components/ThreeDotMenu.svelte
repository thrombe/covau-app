<script lang="ts">
    import { type Option } from "$lib/searcher/item.ts";
    import * as utils from "$lib/utils.ts";
    import { onDestroy } from "svelte";

    export let options: Option[];
    export let classes: string = "";
    let pos_style: (r1: DOMRect, r2: DOMRect) => string = (r1, r2) => {
        let pad = utils.rem() * 0.7;

        let right_edge = r1.left + r1.width/2 + r2.width/2 + pad;
        let left_edge = r1.left + r1.width/2 - r2.width/2 - pad;
        let pad_left = Math.max(0, right_edge - window.innerWidth);
        let pad_right = Math.max(0, -left_edge);

        let bottom_edge = r1.bottom + r1.height/2 + r2.height/2 + pad;
        let top_edge = r1.bottom + r1.height/2 - r2.height/2 - pad;
        let pad_bottom = Math.max(0, bottom_edge - window.innerHeight);
        let pad_top = Math.max(0, -top_edge);

        return `
            top: calc(${r1.bottom + r1.height / 2}px - ${r2.height / 2}px - ${pad_bottom - pad_top}px);
            left: calc(${r1.left + r1.width / 2}px - ${r2.width / 2}px - ${pad_left - pad_right}px);
        `;
    };

    let menu: HTMLElement | null = null;
    let button: HTMLElement | null = null;
    let pos_styles = "";

    let show_menu: boolean = false;
    let timeout: number = 0;
    const menu_disabler = () => {
        window.removeEventListener("pointerup", menu_disabler);
        clearInterval(timeout);
        show_menu = false;
    };
    let on_menu_click = (e: PointerEvent) => {
        if (!show_menu) {
            button = e.target as HTMLElement;
            clearInterval(timeout);
            // @ts-ignore
            timeout = setInterval(() => {
                if (button == null || menu == null) {
                    return;
                }
                let rect = button.getBoundingClientRect();
                let self_rect = menu.getBoundingClientRect();

                if (self_rect.width <= 1) {
                    pos_styles = "z-index: -70;";
                    show_menu = true;
                } else if (pos_style) {
                    pos_styles = pos_style(rect, self_rect);
                    show_menu = true;
                }
            }, 10);

            setTimeout(() => {
                window.addEventListener("pointerup", menu_disabler);
            }, 300);
        }
    };

    $: if (menu != null && button != null && show_menu) {
        document.body.appendChild(menu);
    }
    onDestroy(() => {
        menu?.remove();
    });
</script>

<slot {show_menu} {on_menu_click} />
<div
    class="absolute flex flex-col gap-1 p-2 bg-gray-600 bg-opacity-40 rounded-xl backdrop-blur-md backdrop-brightness-[80%] z-10 overflow-y-auto scrollbar-hide w-fit {classes}"
    style={`${pos_styles};`}
    class:hidden={!show_menu}
    bind:this={menu}
>
    {#each options as option}
        <button
            on:pointerup={utils.wrap_toast(option.onclick)}
            class="flex flex-row rounded-md p-2 hover:bg-gray-100 hover:bg-opacity-15 min-w-max place-items-center"
        >
            <img alt={option.title} class="h-6 w-6 p-1" src={option.icon} />
            <div
                class="pl-2 pr-1 text-left text-sm text-gray-200 text-ellipsis whitespace-nowrap overflow-hidden select-none"
            >
                {option.title}
            </div>
        </button>
    {/each}
</div>
