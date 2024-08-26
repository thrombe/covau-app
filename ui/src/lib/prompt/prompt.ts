import type { NewSearcher, Searcher } from "$lib/searcher/searcher.ts";
import { writable, type Readable, type Writable, derived } from "svelte/store";
import { ListItem, type Option } from "$lib/searcher/item.ts";

export type InputPromptInfo = {
    type: "Input",
    placeholder: string,
    resolve: (s: string | null) => void,
};
export type SearcherPromptInfo = {
    type: "Searcher",
    searcher: Writable<Searcher>,
    new_searcher: NewSearcher | null,
    query: Writable<string>;
    placeholder: string,
    focus_input: boolean,
    resolve: (item: ListItem | null) => void,
};
export type Prompt = InputPromptInfo | SearcherPromptInfo;

export class Prompter {
    active: Writable<Prompt | null>;

    constructor() {
        this.active = writable(null);
    }

    async prompt(placeholder: string): Promise<string | null> {
        let resolve: (s: string | null | PromiseLike<string | null>) => void;
        let promise = new Promise<string | null>((r) => {
            resolve = r;
        });
        let p: Prompt = {
            type: "Input",
            placeholder,
            resolve: (str: string | null) => {
                resolve(str);
                this.active.set(null);
            },
        };
        this.active.set(p);
        let res = await promise;
        return res;
    }

    async searcher_prompt(
        s: Searcher,
        focus_input: boolean = false,
        placeholder: string | null = null,
        query: string | null = null,
        new_searcher: NewSearcher | null = null,
    ): Promise<ListItem | null> {
        let resolve: (s: ListItem | null | PromiseLike<ListItem | null>) => void;
        let promise = new Promise<ListItem | null>((r) => {
            resolve = r;
        });

        let q = writable(query ?? "");
        let searcher = writable(s);
        let p: SearcherPromptInfo = {
            type: "Searcher",
            searcher,
            focus_input,
            new_searcher,
            placeholder: placeholder ?? "Search",
            query: q,
            resolve: (item: ListItem | null) => {
                resolve(item);
                this.active.set(null);
            },
        };
        q.subscribe(async (q) => {
            if (p.new_searcher) {
                p.searcher.set(await p.new_searcher(q));
            }
        });

        this.active.set(p);
        let res = await promise;
        return res;
    }
}

export let prompter = new Prompter();

