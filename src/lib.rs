#![cfg(feature = "wasmdeps")]

use serde::{Deserialize, Serialize};
use log::{info, debug};
use log::Level;
use gloo_utils::format::JsValueSerdeExt;
use wasm_bindgen::{JsError, JsValue};


// When the `wee_alloc` feature is enabled, this uses `wee_alloc` as the global
// allocator.
//
// If you don't want to use `wee_alloc`, you can safely delete this.
// #[cfg(feature = "wee_alloc")]
// #[global_allocator]
// static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;


// This is like the `main` function, except for JavaScript.
#[wasm_bindgen::prelude::wasm_bindgen(start)]
pub fn main_js() -> Result<(), JsValue> {
    // This provides better error messages in debug mode.
    // It's disabled in release mode so it doesn't bloat up the file size.
    // #[cfg(debug_assertions)]
    console_error_panic_hook::set_once();
    console_log::init_with_level(Level::Debug).expect("could not init logger");

    info!("wasm loaded");

    Ok(())
}

#[wasm_bindgen::prelude::wasm_bindgen]
pub async fn test_req(a: JsValue) -> Result<(), JsError> {
    Ok(())
}
