<script lang="ts">
    import { type Option } from "$lib/searcher/item.ts";
    import * as utils from "$lib/utils.ts";
    import { onDestroy } from "svelte";

    export let options: Option[];
    export let classes: string = "";
    let pos_style: (r1: DOMRect, r2: DOMRect) => string = (r1, r2) => {
        let pad = utils.rem() * 0.7;

        let x = r1.left + r1.width / 2 - r2.width;
        if (x < 0) {
            x += r2.width + pad;
        } else {
            x -= pad;
        }

        let y = r1.top + r1.height / 2;
        if (y + r2.height > window.innerHeight) {
            y -= r2.height + pad;
        } else {
            y += pad;
        }

        return `
            top: calc(${y}px);
            left: calc(${x}px);
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
