<script lang="ts">
    export let value: string;
    export let placeholder: string;
    export let on_keydown = async (e: KeyboardEvent) => {};
    export let on_enter = async (e: KeyboardEvent) => {};
    export let on_unfocus = async () => {};
    export let on_focus = async () => {};
    export let input_element: HTMLElement | null = null;
    export let focus_on_create = false;
    export let classes = "";

    const _on_keydown = async (e: KeyboardEvent) => {
        console.log(e);
        if (e.key === "Enter") {
            e.preventDefault();
            await on_enter(e);
            input_element?.blur();
        } else if (e.key == "Escape") {
            e.preventDefault();
            input_element?.blur();
            await on_unfocus();
        } else {
            await on_keydown(e);
        }
    };

    $: if (input_element && focus_on_create) {
        input_element.focus();
    }
</script>

<input
    class="w-full h-full text-center focus:border-none focus:outline-none bg-opacity-0 bg-gray-50 text-gray-200 text-lg selection:bg-gray-200 selection:bg-opacity-20 {classes}"
    {placeholder}
    bind:value
    on:focus={on_focus}
    on:keydown={_on_keydown}
    bind:this={input_element}
/>
