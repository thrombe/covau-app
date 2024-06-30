<script context="module" lang="ts">
    import { prompter } from "./prompt.ts";

    let prompt = prompter.active;
</script>

<script lang="ts">
    import InputBar from "$lib/components/InputBar.svelte";
    import { onDestroy } from "svelte";
    import * as icons from "$lib/icons.ts";

    let show: boolean = false;
    let placeholder: string;
    let value: string;
    let input_element: HTMLElement;

    let unsub = prompt.subscribe((e) => {
        if (!e) {
            show = false;
            value = "";
            return;
        } else {
            show = true;
            placeholder = e.placeholder;
        }
    });
    onDestroy(unsub);

    const on_enter = async (_: KeyboardEvent) => {
        $prompt!.resolve(value);
        value = "";
    };
    const on_unfocus = async () => {
        $prompt!.resolve(null);
        value = "";
    };

    $: if (input_element) {
        input_element.focus();
        console.log("focused");
    }
</script>

{#if show}
    <div class="fixed top-0 flex flex-col w-full h-full items-center">
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
            on:click={on_unfocus}
            class="absolute w-full h-full -z-10 bg-gray-900 bg-opacity-20 backdrop-blur-[2px] transition-opacity"
            style="transition-duration: 800ms;"
        />
        <div
            class="flex flex-row mt-32 gap-4 h-20 w-[50%] min-w-[28rem] rounded-xl bg-gray-500 bg-opacity-20 backdrop-blur-lg transition-opacity"
            style="transition-duration: 800ms;"
        >
            <InputBar
                classes={"text-2xl font-semibold placeholder-gray-200 placeholder-opacity-60"}
                bind:input_element
                {placeholder}
                bind:value
                {on_enter}
                {on_unfocus}
            />
            <button class="px-4">
                <img
                    src={icons.floppy_disk}
                    alt="enter"
                    class="h-10 opacity-40 text-center"
                />
            </button>
        </div>
    </div>
{/if}
