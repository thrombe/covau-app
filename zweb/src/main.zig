const WebView = @import("webview").WebView;

pub fn main() void {
    const w = WebView.create(true, null);
    defer w.destroy();
    w.setTitle("Basic Example");
    w.setSize(480, 320, WebView.WindowSizeHint.None);
    // w.setHtml("Thanks for using webview!");
    w.navigate("http://localhost:6175/#/local");
    w.run();
}
