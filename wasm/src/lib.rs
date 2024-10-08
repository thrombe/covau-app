#![allow(non_snake_case)]
#![allow(dead_code)]
#![allow(unused_imports)]

use serde::{Deserialize, Serialize};

use libcovau::{
    log::Level,
    log::{debug, info},
    tsify_next::JsValueSerdeExt,
    wasm_bindgen::UnwrapThrowExt,
    wasm_bindgen::{prelude::wasm_bindgen as bindgen, JsError, JsValue},
    *,
};

use crate::bad_error::BadError;

#[bindgen(start)]
pub fn main_js() -> Result<(), JsValue> {
    console_error_panic_hook::set_once();
    console_log::init_with_level(Level::Debug).expect("could not init logger");

    info!("wasm loaded");

    Ok(())
}

pub mod utils {
    use super::base64::Engine;
    use super::*;

    use crate::bad_error::BadError;

    #[bindgen]
    pub fn base64_encode(data: Vec<u8>) -> String {
        base64::prelude::BASE64_STANDARD.encode(data)
    }

    #[bindgen]
    pub fn base64_decode(b64: String) -> Result<Vec<u8>, JsError> {
        base64::prelude::BASE64_STANDARD.decode(b64).bad_err()
    }
}

pub mod searcher {
    use super::*;

    #[derive(Debug)]
    #[bindgen(getter_with_clone, inspectable)]
    // #[cfg_attr(feature = "wasmdeps", derive(tsify_next::Tsify), tsify(into_wasm_abi, from_wasm_abi))]
    pub struct Searcher {
        client: reqwest::Client,
        cont: Option<JsValue>,
    }

    #[bindgen]
    impl Searcher {
        // constructors leak memory (fixed in main branch)
        // - [Fix Rust values getting GC'd while still borrowed and not getting GC'd if created via. constructor by Liamolucko · Pull Request #3940 · rustwasm/wasm-bindgen · GitHub](https://github.com/rustwasm/wasm-bindgen/pull/3940)
        // #[wasm_bindgen(constructor)]
        pub fn new() -> Self {
            Self {
                client: reqwest::Client::new(),
                cont: None,
            }
        }

        pub async fn test_client(&self) -> Result<(), JsError> {
            let req = self.client.get("http://localhost:5173/").build()?;
            let resp = self.client.execute(req).await?;
            let str = resp.text().await?;
            info!("{}", str);
            Ok(())
        }
    }
}

// trait to jsify serde stuff
trait JsIfy {
    fn to_js(&self) -> Result<JsValue, JsError>;
}
impl<T> JsIfy for T
where
    T: Serialize,
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
    use super::wasm_bindgen::JsError;

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
    where
        E: std::fmt::Display,
    {
        fn bad_err(self) -> Result<T, JsError> {
            match self {
                Ok(t) => Ok(t),
                Err(e) => Err(JsError::new(&e.to_string())),
            }
        }
    }
}
