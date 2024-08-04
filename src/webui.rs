use std::{ffi::CStr, sync::Arc};
use webui_rs::webui::{self, bindgen::webui_malloc};

// returned pointer is only freed if allocated using webui_malloc
// https://github.com/webui-dev/webui/blob/a3f3174c73b2414ea27bebb0fd62ccc0f180ad30/src/webui.c#L3150C1-L3150C23
unsafe extern "C" fn unsafe_handle(
    name: *const std::os::raw::c_char,
    length: *mut i32,
) -> *const std::os::raw::c_void {
    let name = CStr::from_ptr(name);
    let res = handle(name.to_string_lossy().as_ref());
    let res = res.into_boxed_str();
    *length = res.len() as _;
    let block = webui_malloc(res.len());
    std::ptr::copy_nonoverlapping(res.as_ptr(), block as _, res.len());
    block as _
}

fn handle(name: &str) -> String {
    dbg!(name);
    // let data = reqwest::blocking::get(String::from("http://localhost:5173") + name).unwrap().text().unwrap();
    let data = std::fs::read_to_string(String::from("./electron/dist") + name).unwrap();
    dbg!(&data);
    data
}

#[derive(Clone)]
pub struct App {
    pub win: Arc<webui::Window>,
}
impl App {
    pub fn new() -> Self {
        Self {
            win: Arc::new(webui::Window::new()),
        }
    }

    pub async fn open_window(&self, url: String, port: u16) -> anyhow::Result<()> {
        self.win.set_file_handler(unsafe_handle);
        unsafe {
            let _ = webui::bindgen::webui_set_port(self.win.id, port);
        }
        webui::set_timeout(3);
        self.win.bind("", |e| {
            dbg!(e.event_type as u32);
        });

        // unsafe extern "C" fn events(e: *mut webui::bindgen::webui_event_t) {
        //     let e = &*e;
        //     dbg!(e.type_);
        // }
        // unsafe {
        //     webui::bindgen::webui_bind(self.win.id, [0].as_ptr(), Some(events));
        // }

        let s = self.clone();
        tokio::task::spawn_blocking(move || {
            s.win.show(url);
            // s.win.show("<html><script src=\"/webui.js\"></script> ... </html>");
            // let _ = s.win.run_js("console.log('webui.js loaded :}')");
            webui::wait();
        })
        .await?;

        Ok(())
    }

    pub fn close(&self) {
        self.win.close();
    }
}
