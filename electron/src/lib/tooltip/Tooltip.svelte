<script lang="ts">
    import { onDestroy } from "svelte";

    export let tooltip: string;

    let hide_style = "position: absolute; top: 0; left: 0; z-index: -70; opacity: 0%;";
    let pos_style: (r1: DOMRect, r2: DOMRect) => string = (r1, r2) => {
        let rem = parseInt(getComputedStyle(document.documentElement).fontSize);
        let pad = rem * 0.7;
        let right_edge = r1.left + r1.width/2 + r2.width/2 + pad;
        let left_edge = r1.left + r1.width/2 - r2.width/2 - pad;
        let pad_left = Math.max(0, right_edge - window.innerWidth);
        let pad_right = Math.max(0, -left_edge);
        return `top: calc(${r1.top}px - ${r2.height}px - 0.5rem); left: calc(${r1.left + r1.width / 2}px - ${r2.width / 2}px - ${pad_left - pad_right}px);`;
    };
    let show = false;

    let parent: HTMLElement | null = null;
    let ttip: HTMLElement | null = null;
    let timeout: number = 0;
    let pos_styles = hide_style;
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
                pos_styles = hide_style;
            } else {
                pos_styles = pos_style(rect, self_rect);
            }
        }, 10);
    };
    const on_leave = (e: PointerEvent) => {
        clearInterval(timeout);
        show = false;
        pos_styles = hide_style;
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
    class="tooltip transition-opacity delay-500 duration-150"
    class:hidden={!show}
    style={`${pos_styles};`}
    use:use_tooltip
>
    {tooltip}
</div>

<style lang="postcss">
    .tooltip {
        @apply absolute inline-block max-w-full overflow-hidden text-nowrap p-3 rounded-xl bg-gray-200 bg-opacity-20 backdrop-blur-lg text-gray-200 font-medium text-sm;
    }

    button:hover .tooltip {
        @apply z-20 group-hover:visible delay-500 duration-100;
    }
</style>
