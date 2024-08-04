<script lang="ts">
    import { onDestroy } from "svelte";

    export let tooltip: string;

    let pos_style: (r1: DOMRect, r2: DOMRect) => string = (r1, r2) => {
        return `top: calc(${r1.top}px - ${r2.height}px - 0.5rem); left: calc(${r1.left + r1.width / 2}px - ${r2.width / 2}px);`;
    };
    let show = false;

    let parent: HTMLElement | null = null;
    let ttip: HTMLElement | null = null;
    let timeout: number = 0;
    let pos_styles = "";
    const on_enter = (e: PointerEvent) => {
        show = true;
        parent = e.target as HTMLElement;
        clearInterval(timeout);
        // @ts-ignore
        timeout = setInterval(() => {
            if (parent == null || ttip == null) {
                return;
            }

            let rect = parent.getBoundingClientRect();
            let self_rect = ttip.getBoundingClientRect();

            if (self_rect.height <= 1) {
                pos_styles = "z-index: -70;";
            } else {
                pos_styles = pos_style(rect, self_rect);
            }
        }, 10);
    };
    const on_leave = (e: PointerEvent) => {
        clearInterval(timeout);
        show = false;
        pos_styles = "z-index: -70;";
    };
    const use_tooltip = (e: HTMLElement) => {
        ttip = e;
        document.body.appendChild(e);
    };
    onDestroy(() => {
        ttip?.remove();
    });
</script>

<slot {on_enter} {on_leave}/>
<div
    class="tooltip"
    class:hidden={!show}
    style={`${pos_styles};`}
    use:use_tooltip
>
    {tooltip}
</div>

<style lang="postcss">
    .tooltip {
        @apply absolute inline-block max-w-36 overflow-hidden text-nowrap p-3 rounded-xl bg-gray-200 bg-opacity-20 backdrop-blur-lg text-gray-200 font-medium text-sm;
    }

    button:hover .tooltip {
        @apply z-20 group-hover:visible delay-500 duration-100;
    }
</style>
