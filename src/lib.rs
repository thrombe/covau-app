#![cfg(feature = "wasmdeps")]
#![allow(non_snake_case)]

use serde::{Deserialize, Serialize};
use log::{info, debug};
use log::Level;
use tsify_next::JsValueSerdeExt;
use wasm_bindgen::UnwrapThrowExt;
use wasm_bindgen::{JsError, JsValue, prelude::wasm_bindgen};
// use tsify_next::

use crate::bad_error::BadError;

// This is like the `main` function, except for JavaScript.
#[wasm_bindgen(start)]
pub fn main_js() -> Result<(), JsValue> {
    console_error_panic_hook::set_once();
    console_log::init_with_level(Level::Debug).expect("could not init logger");

    info!("wasm loaded");

    Ok(())
}

pub mod searcher {
    use super::*;

    #[derive(Debug)]
    pub struct OpaqueLmao {
        pub thing: String,
    }

    impl Drop for OpaqueLmao {
        fn drop(&mut self) {
            info!("opaque dropped");
        }
    }

    #[derive(Debug)]
    #[wasm_bindgen(getter_with_clone, inspectable)]
    pub struct Searcher {
        client: reqwest::Client,
        cont: Option<JsValue>,

        // :) non pub things are kept hidden from JS :)
        query: OpaqueLmao,
    }

    #[wasm_bindgen]
    impl Searcher {
        #[wasm_bindgen(constructor)]
        pub fn new() -> Self {
            Self {
                client: reqwest::Client::new(),
                cont: None,
                query: OpaqueLmao { thing: "".into() },
            }
        }
    }

    // drop isn't called in js :(
    // it does mem::forget
    impl Drop for Searcher {
        fn drop(&mut self) {
            info!("searcher dropped");
        }
    }
}

pub mod typ {
    use super::*;
    #[derive(Serialize, Deserialize, Debug, Clone)]
    #[serde(tag = "type", content = "content")]
    #[cfg_attr(feature = "wasmdeps", derive(tsify_next::Tsify), tsify(into_wasm_abi, from_wasm_abi))]
    pub enum Typ {
        Some,
        Bhing(String),
    }
}
use typ::*;

pub mod gyaat {
    use super::*;
    #[derive(Serialize, Deserialize, Debug)]
    // #[cfg_attr(feature = "wasmdeps", derive(tsify_next::Tsify), tsify(into_wasm_abi, from_wasm_abi))]
    #[wasm_bindgen(getter_with_clone, inspectable)]
    pub struct Gyaat {
        pub lmao: Typ,
        pub misc: Vec<String>,
    }

    #[wasm_bindgen]
    impl Gyaat {
        pub async fn goon(&self, b: Gyaat) -> Result<Typ, JsError> {
            Ok(Typ::Some)
        }
    }
}
use gyaat::*;

#[wasm_bindgen]
pub async fn test_req(a: Gyaat) -> Result<Typ, JsError> {
    // a.into_js();
    // let a: Gyaat = a.to_rs()?;
    Ok(Typ::Some)
}

// trait to jsify serde stuff
trait JsIfy {
    fn to_js(&self) -> Result<JsValue, JsError>;
}
impl<T> JsIfy for T
where T: Serialize
{
    fn to_js(&self) -> Result<JsValue, JsError> {
        JsValue::from_serde(self).bad_err()
    }
}

// trait to extend capabilities of JsValue
trait JsExt {
    fn to_rs<T: for<'de> Deserialize<'de>>(&self) -> Result<T, JsError>;
}
impl JsExt for JsValue {
    fn to_rs<T: for<'de> Deserialize<'de>>(&self) -> Result<T, JsError> {
        // let s = if self.is_undefined() {
        //     String::from("null")
        // } else {
        //     js_sys::JSON::stringify(self)
        //         .map(String::from)
        //         .unwrap_throw()
        // };
        // serde_json::from_str(&s).bad_err()
        self.into_serde().bad_err()
    }
}

pub mod bad_error {
    use wasm_bindgen::JsError;

    pub trait BadError<T> {
        fn bad_err(self) -> Result<T, JsError>;
    }
    // impl<T, E> BadError<T> for Result<T, E>
    // where E: std::error::Error
    // {
    //     fn bad_err(self) -> Result<T, JsError> {
    //         match self {
    //             Ok(t) => Ok(t),
    //             Err(e) => Err(JsError::from(e)),
    //         }
    //     }
    // }
    // impl<T> BadError<T> for Result<T, anyhow::Error>
    // {
    //     fn bad_err(self) -> Result<T, JsError> {
    //         match self {
    //             Ok(t) => Ok(t),
    //             Err(e) => Err(JsError::new(&e.to_string())),
    //         }
    //     }
    // }
    impl<T, E> BadError<T> for Result<T, E>
    where E: std::fmt::Display
    {
        fn bad_err(self) -> Result<T, JsError> {
            match self {
                Ok(t) => Ok(t),
                Err(e) => Err(JsError::new(&e.to_string())),
            }
        }
    }
}
