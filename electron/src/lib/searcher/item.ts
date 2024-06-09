
export abstract class ListItem {
    abstract key(): unknown;
    abstract title(): string;
    abstract thumbnail(): string | null;
    abstract default_thumbnail(): string;
    abstract title_sub(): string | null;
    abstract options(ctx: RenderContext): Option[];
    abstract audio_uri(): Promise<string | null>;
}

export type RenderContext = "Queue" | "Browser" | "Playbar";
export type Callback = (() => void) | (() => Promise<void>);
export type Option = {
    icon: string,
    tooltip: string,
    location: "IconTop" | "TopRight" | "BottomRight" | "OnlyMenu",
    onclick: Callback,
};
