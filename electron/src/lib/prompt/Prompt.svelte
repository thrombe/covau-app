<script context="module" lang="ts">
    import { fly } from "svelte/transition";
    import { prompter } from "./prompt.ts";

    let prompt = prompter.active;
</script>

<script lang="ts">
    import InputBar from "$lib/components/InputBar.svelte";
    import { onDestroy } from "svelte";

    let show: boolean = false;
    let placeholder: string;
    let value: string;
    let input_element: HTMLElement;

    let unsub = prompt.subscribe((e) => {
        if (!e) {
            show = false;
            return;
        } else {
            show = true;
            placeholder = e.placeholder;
        }
    });
    onDestroy(unsub);

    const on_enter = async (_: KeyboardEvent) => {
        $prompt!.resolve(value);
    };
    const on_unfocus = async () => {
        $prompt!.resolve(null);
    };

    $: if (input_element) {
        input_element.focus();
        console.log("focused");
    }
</script>

{#if show}
    <div class="relatice fixed top-0 flex flex-col w-full h-full items-center">
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div on:click={on_unfocus} class="absolute w-full h-full -z-10" />
        <div
            in:fly={{ y: -20, duration: 200 }}
            out:fly={{ x: 20, duration: 200 }}
            class="flex flex-row mt-32 gap-4 h-20 w-[50%] min-w-[28rem] rounded-xl bg-gray-400 bg-opacity-20 backdrop-blur-md"
        >
            <InputBar
                bind:input_element
                {placeholder}
                bind:value
                {on_enter}
                {on_unfocus}
            />
            <button class="px-4">
                <img
                    src="/static/floppy-disk.svg"
                    alt="enter"
                    class="h-10 opacity-40 text-center"
                />
            </button>
        </div>
    </div>
{/if}
