import type { Message } from '$types/server';
import { toast } from './toast/toast';

class Server {
    ws: WebSocket;

    constructor() {
        this.ws = new WebSocket(`ws://localhost:${import.meta.env.SERVER_PORT}/serve`);

        this.ws.addEventListener('message', async (e) => {
            let mesg: Message<unknown> = JSON.parse(e.data);
            console.log(mesg)

            if (mesg.type === "Err") {
                toast(mesg.content, "error");
                return;
            }

            let resp = await this.handle_req(mesg.content);

            if (!resp) {
                return;
            }

            let resp_mesg = { id: mesg.id, data: resp };

            this.ws.send(JSON.stringify(resp_mesg));
        });
    }

    async handle_req(req: unknown): Promise<Object | null> {
        return {};
    }
}

export let server: Server | null = null;
export const serve = async () => {
    server = new Server();
};
