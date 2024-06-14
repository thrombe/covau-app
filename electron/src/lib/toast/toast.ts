import { writable, type Writable } from "svelte/store";

interface ToastInfo {
    message: string,
    classes: string,
    timeout: number,
}
interface ToastEntry {
    toast: ToastInfo,
    id: number,
}

export class Toaster {
    active: Writable<ToastEntry[]>;
    next_id: number = 0;

    constructor() {
        this.active = writable([]);
    }

    async toast(t: ToastInfo) {
        let te = { toast: t, id: this.next_id };
        this.next_id += 1;
        // this.active.update(s => {
        //     s.push(te);
        //     return s;
        // });
        this.active.update(s => [te, ...s]);
        let p = new Promise(r => setTimeout(() => r(null), t.timeout));
        await p;
        this.active.update(s => s.filter(e => e.id != te.id));
    }
}

export let toaster = new Toaster();
export let toast = async (message: string, level: 'info' | 'error' = 'info', timeout = 1000) => {
    let color: string;
    if (level == 'error') {
        color = 'bg-red-400';
    } else if (level == 'info') {
        color = 'bg-blue-400';
    } else {
        color = 'bg-gray-400';
    }
    await toaster.toast({
        message,
        classes: `whitespace-nowrap block ${color} bg-opacity-90 font-bold text-gray-900 rounded-lg p-2 text-sm`,
        timeout: timeout,
    });
};
