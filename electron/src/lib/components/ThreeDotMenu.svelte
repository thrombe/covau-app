<script lang="ts">
    import { type Option } from "$lib/searcher/item.ts";

    export let show_menu: boolean;
    export let options: Option[];

    const menu_disabler = () => {
        console.log("disabler", show_menu);
        window.removeEventListener("click", menu_disabler);
        show_menu = false;
    };
    let on_menu_click = () => {
        show_menu = true;
        setTimeout(() => {
            window.addEventListener("click", menu_disabler);
        }, 300);
    };

    $: if (show_menu) {
        on_menu_click();
    }
</script>

<slot
    {show_menu}
/>
<div
    class="absolute right-5 top-0 flex flex-col gap-1 p-2 bg-gray-300 bg-opacity-20 rounded-xl backdrop-blur-md z-10"
    class:hidden={!show_menu}
>
    {#each options as option}
        <button on:click={option.onclick}>
            <div
                class="flex flex-row rounded-md p-2 pr-8 hover:bg-gray-100 hover:bg-opacity-15"
            >
                <img
                    alt={option.title}
                    class="h-4 w-4 m-1 mr-4"
                    src={option.icon}
                />

                <div
                    class="flex flex-col justify-end h-1/2 text-sm text-gray-200"
                >
                    <div class="w-full text-ellipsis whitespace-nowrap overflow-hidden select-none">{option.title}</div>
                </div>
            </div>
        </button>
    {/each}
</div>
