
export const fmt_time = (t: number) => {
    let hours = ("000" + Math.floor(t / 3600)).slice(-2);
    let mins = ("000" + Math.floor(t / 60)).slice(-2);
    let secs = ("000" + Math.floor(t % 60)).slice(-2);
    return `${Math.floor(t / 3600) ? hours + ":" : ""}${mins}:${secs}`;
};

export const err_msg = (e: any) => {
    if (e instanceof Error) {
        return e.message;
    } else {
        return e.toString();
    }
}

