<script lang="ts">
    import { type Option } from "$lib/searcher/item.ts";
    import * as utils from "$lib/utils.ts";

    export let options: Option[];
    export let classes: string = "";
    export let styles: string = "";

    let show_menu: boolean = false;
    const menu_disabler = () => {
        window.removeEventListener("pointerup", menu_disabler);
        show_menu = false;
    };
    let on_menu_click = () => {
        if (!show_menu) {
            show_menu = true;
            setTimeout(() => {
                window.addEventListener("pointerup", menu_disabler);
            }, 300);
        }
    };
</script>

<slot {show_menu} {on_menu_click} />
<div
    class="absolute flex flex-col gap-1 p-2 bg-gray-600 bg-opacity-40 rounded-xl backdrop-blur-md backdrop-brightness-[80%] z-10 overflow-y-auto scrollbar-hide {classes}"
    style={styles}
    class:hidden={!show_menu}
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
