
export abstract class ListItem {
    abstract key(): unknown;
    abstract title(): string;
    abstract thumbnail(): string | null;
    abstract default_thumbnail(): string;
    abstract title_sub(): string | null;
    abstract options(): Option[];
}

export type Callback = (() => void) | (() => Promise<void>);
export type Option = {
    icon: string,
    tooltip: string,
    location: "Pos1" | "Pos2",
    onlick: Callback,
};
