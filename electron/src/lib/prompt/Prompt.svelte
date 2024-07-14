<script context="module" lang="ts">
    import { prompter, type Prompt } from "./prompt.ts";

    let prompt = prompter.active;
</script>

<script lang="ts">
    import InputBar from "$lib/components/InputBar.svelte";
    import { onDestroy } from "svelte";
    import * as icons from "$lib/icons.ts";
    import Explorer from "$lib/components/Explorer.svelte";
    import AudioListItem from "$lib/components/AudioListItem.svelte";
    import type { Unique } from "$lib/virtual.ts";
    import type { ListItem } from "$lib/searcher/item.ts";
    import { writable } from "svelte/store";
    import * as stores from "$lib/stores.ts";

    let value: string;
    let selected_item: Unique<ListItem, unknown>;
    let input_element: HTMLElement;
    let input_element_is_focused: boolean = false;

    let prompt_info: Prompt | null;

    let unsub = prompt.subscribe((e) => {
        if (!e) {
            prompt_info = null;
            value = "";
            return;
        } else {
            prompt_info = e;
        }
    });
    onDestroy(unsub);

    const input_on_enter = async (_: KeyboardEvent) => {
        if (prompt_info?.type == "Input") {
            prompt_info.resolve(value);
            value = "";
        } else if (prompt_info?.type == "Searcher") {
            prompt_info.query.set(value);
        }
    };
    const end_prompt = async () => {
        if (prompt_info) {
            prompt_info.resolve(null);
        }
        value = "";
    };
    const on_window_keypress = async (k: KeyboardEvent) => {
        if (!prompt_info) {
            return;
        }
        if (input_element_is_focused) {
            return;
        }

        if (k.key == "Enter") {
            if (prompt_info?.type == "Searcher") {
                prompt_info.resolve(selected_item.data);
                value = "";
            }
        } else if (k.key == "/") {
            value = "";
            input_element.focus();
            k.preventDefault();
        } else if (k.key == "?") {
            input_element.focus();
            k.preventDefault();
        } else if (k.key == "Escape") {
            await end_prompt();
        }
    };

    let timeout: number;
    const search_input_on_keydown = async () => {
        clearTimeout(timeout);
        input_element_is_focused = true;
        timeout = setTimeout(() => {
            input_element_is_focused = false;
        }, 300) as unknown as number;
    };

    $: if (input_element) {
        if (prompt_info?.type == "Input") {
            input_element.focus();
        }
        if (prompt_info?.type == "Searcher" && prompt_info?.focus_input) {
            input_element.focus();
        }
    }
</script>

<svelte:window on:keydown={on_window_keypress} />

{#if prompt_info != null}
    <div class="fixed top-0 flex flex-col w-full h-full items-center">
        <div
            on:pointerup={end_prompt}
            class="absolute w-full h-full -z-10 bg-gray-900 bg-opacity-20 backdrop-blur-[2px] transition-opacity"
            style="transition-duration: 800ms;"
        />
        {#if prompt_info.type == "Input"}
            <div
                class="flex flex-row mt-32 h-20 pl-4 w-[50%] min-w-[28rem] rounded-xl bg-gray-500 bg-opacity-20 backdrop-blur-lg transition-opacity"
                style="transition-duration: 800ms;"
            >
                <InputBar
                    classes={"text-2xl font-semibold placeholder-gray-200 placeholder-opacity-60"}
                    bind:input_element
                    placeholder={prompt_info?.placeholder ?? ""}
                    bind:value
                    on_enter={input_on_enter}
                    on_unfocus={end_prompt}
                />
                <button class="px-4">
                    <img
                        src={icons.floppy_disk}
                        alt="enter"
                        class="h-10 opacity-40 text-center"
                    />
                </button>
            </div>
        {:else if prompt_info.type == "Searcher"}
            <div
                class="flex flex-col gap-1 w-[80%] max-w-[40rem] mx-4 my-16 rounded-xl bg-gray-500 bg-opacity-20 backdrop-blur-lg transition-opacity"
            >
                <div
                    class="w-full flex flex-row h-16 pl-4 bg-gray-400 bg-opacity-20 background-blur-lg rounded-t-xl"
                >
                    <InputBar
                        classes={"text-2xl font-semibold placeholder-gray-200 placeholder-opacity-60"}
                        bind:input_element
                        placeholder={prompt_info?.placeholder ?? ""}
                        bind:value
                        on_keydown={search_input_on_keydown}
                        on_enter={input_on_enter}
                    />
                    <button class="px-4">
                        <img
                            src={icons.floppy_disk}
                            alt="enter"
                            class="h-10 opacity-40 text-center"
                        />
                    </button>
                </div>

                <div
                    class="flex flex-row flex-grow-0 px-3"
                    style="height: 80vh;"
                >
                    <Explorer
                        columns={1}
                        item_height={75}
                        searcher={prompt_info.searcher}
                        updater={writable(1)}
                        source_key={stores.new_key()}
                        keyboard_control={true}
                        bind:selected_item
                        let:item
                        let:selected
                    >
                        <list-item class:selected>
                            <div draggable={true} class="item-bg">
                                <AudioListItem
                                    {item}
                                    ctx="Prompt"
                                    show_buttons={selected}
                                />
                            </div>
                        </list-item>
                    </Explorer>
                </div>
            </div>
        {/if}
    </div>
{/if}

<style lang="postcss">
    .item-bg {
        @apply w-full h-full;
    }
    list-item:hover .item-bg,
    .selected .item-bg {
        @apply bg-gray-200 bg-opacity-10 rounded-xl;
    }
</style>
