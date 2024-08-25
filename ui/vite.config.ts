import { type AddressInfo } from 'net'
import { resolve } from 'path'
import { spawn, type ChildProcess } from 'child_process'
import type { ViteDevServer } from 'vite'
import { defineConfig, build } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import * as path from 'path';
import tsconfig from "./tsconfig.json";

const tsconfigPathAliases = Object.fromEntries(
    Object.entries(tsconfig.compilerOptions.paths).map(([key, values]) => {
        let value = values[0];
        if (key.endsWith("/*")) {
            key = key.slice(0, -2);
            value = value.slice(0, -2);
        }

        const nodeModulesPrefix = "node_modules/";
        if (value.startsWith(nodeModulesPrefix)) {
            value = value.replace(nodeModulesPrefix, "");
        } else {
            value = path.resolve(value);
        }

        return [key, value];
    })
);

async function bundle(server: ViteDevServer) {
    const address = server.httpServer.address() as AddressInfo
    // const host = address.address === '127.0.0.1' ? 'localhost' : address.address
    const host = "localhost";

    let appUrl;
    if (process.env.BUILD_MODE === "DEV") {
        appUrl = `http://${host}:${address.port}`
    } else if (process.env.BUILD_MODE === "PROD") {
        appUrl = `http://${host}:${process.env.SERVER_PORT}`

    } else {
        throw Error("unknown BUILD_MODE");
    }
    appUrl += "/#/local";

    // this is RollupWatcher, but vite do not export its typing...
    const watcher: any = await build({
        configFile: 'vite.config.electron.ts',
        mode: server.config.mode,
        build: {
            watch: {} // to make a watcher
        },
        define: {
            'import.meta.env.ELECTRON_APP_URL': JSON.stringify(appUrl)
        }
    })

    // use require, it will return a string pointing to the electron binary
    // const electron = require('electron') as string

    // resolve the electron main file
    const electronMain = resolve(server.config.root, server.config.build.outDir, "electron", 'main.js')

    let child: ChildProcess | undefined

    // exit the process when electron closes
    function exitProcess() {
        process.exit(0)
    }

    // restart the electron process
    function start() {
        if (child) {
            child.kill()
            child = undefined
        }

        child = spawn("electron", [electronMain], {
            windowsHide: false
        })
        child.stdout.on('data', (data) => {
            console.log(data.toString());
        });
        child.stderr.on('data', (data) => {
            console.error(data.toString());
        });

        child.on('close', exitProcess)
    }

    function startElectron({ code }: any) {
        if (code === 'END') {
            watcher.off('event', startElectron)
            start()
        }
    }

    if (process.env.UI_BACKEND === "ELECTRON") {
        watcher.on('event', startElectron)

        // watch the build, on change, restart the electron process
        watcher.on('change', () => {
            // make sure we dont kill our application when reloading
            child?.off('close', exitProcess)

            start()
        })
    }
}

export default defineConfig((env) => {
    let define = {
        "import.meta.env.SERVER_PORT": process.env.SERVER_PORT,
    };

    if (process.env.BUILD_MODE == "PROD") {
        define['import.meta.env.SERVER_PORT'] = '"%SERVER_PORT%"';
    }

    let config = {
        // nice feature of vite as the mode can be set by the CLI
        base: env.mode === 'production' ? './' : '/',
        resolve: {
            alias: tsconfigPathAliases,
        },
        define,
        server: {
            port: parseInt(process.env.DEV_VITE_PORT),
        },
        plugins: [
            svelte(),
            // {
            //     name: 'electron-vite',
            //     configureServer(server) {
            //         server.httpServer.on('listening', () => {
            //             bundle(server).catch(server.config.logger.error)
            //         })
            //     }
            // }
        ]
    };
    return config;
})
