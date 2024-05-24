const std = @import("std");
const webui = @import("webui");

pub fn main() !void {
    var nwin = webui.newWindow();

    nwin.setFileHandler(handle);

    nwin.setRuntime(webui.Runtimes.NodeJS);

    // _ = nwin.show("<html><head><script src=\"webui.js\"></script><head></head><body><a href=\"/test.html\"> Hello World ! </a> </body></html>");
    // _ = nwin.show("https://covau.netlify.app");
    _ = nwin.show("http://localhost:5173");

    var response: [64]u8 = std.mem.zeroes([64]u8);
    const a = nwin.script(
        \\ console.log('hello')
        \\
        \\ import express from "npm:express";
        \\ const app = express();
        \\
        \\ console.log(app)
        \\
        \\ app.listen(3000);
    , 0, &response);
    std.debug.print("{s}\n", .{response});
    nwin.run(
        \\
        \\
        \\
        \\ console.log('hello')
        \\
        \\
    );
    _ = nwin.bind("", events);
    // const a = nwin.show("test.ts");
    std.debug.print("{}\n", .{a});
    webui.wait();
}

fn events(e: webui.Event) void {
    std.debug.print("{?}\n", .{e});
}

fn handle(name: []const u8) ?[]u8 {
    std.debug.print("{s}\n", .{name});
    return null;
}
