import { writable, type Writable } from "svelte/store";

interface Prompt {
    placeholder: string,
    resolve: (s: string | null) => void,
}

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
}

export let prompter = new Prompter();
export let prompt = async (placeholder: string) => {
    let res = await prompter.prompt(placeholder);
    return res;
};

