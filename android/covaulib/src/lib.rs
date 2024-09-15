#![allow(non_snake_case)]

use log::{info, error};
use log::LevelFilter;

use libcovau::anyhow::Result;
use libcovau::config::FeCommand;

fn togglePlay() -> Result<()> {
    libcovau::command(FeCommand::TogglePlay)
}

// - [define different function names with a macro](https://stackoverflow.com/questions/70128978/how-to-define-different-function-names-with-a-macro)
// - [paste - Rust](https://docs.rs/paste/latest/paste/index.html)
macro_rules! command {
    ($name:ident) => {
        ::paste::paste! {
            #[no_mangle]
            pub unsafe extern "C" fn [<Java_com_thrombe_covau_Covau_ $name>]<'local>(
                _env: jni::JNIEnv<'local>,
                _class: jni::objects::JClass<'local>,
            ) {
                $name().unwrap();
            }
        }
    };
}

pub mod android {
    use jni::objects::{JClass, JString};
    use jni::sys::jstring;
    use jni::JNIEnv;
    use super::*;

    #[no_mangle]
    pub unsafe extern "C" fn Java_com_thrombe_covau_Covau_serve<'local>(
        mut env: JNIEnv<'local>,
        // This is the class that owns our static method. It's not going to be used,
        // but still must be present to match the expected signature of a static
        // native method.
        _class: JClass<'local>,
        data_dir: JString,
    ) -> jstring {
        android_logger::init_once(android_logger::Config::default().with_max_level(log::LevelFilter::Warn));

        std::panic::set_hook(Box::new(move |msg| {
            log::error!("Panic occurred: {}", msg);
            // env.throw_new("java/lang/RuntimeException", msg).expect("Failed to throw exception");
        }));

        let data_dir = env.get_string(&data_dir).expect("could not get data dir string").to_owned();
        libcovau::serve(data_dir.into());

        // Then we have to create a new Java string to return. Again, more info
        // in the `strings` module.
        let output = env
            .new_string(format!("Hello, from rust!"))
            .expect("Couldn't create java string!");

        // Finally, extract the raw pointer to return.
        output.into_raw()
    }

    command!(togglePlay);
}
