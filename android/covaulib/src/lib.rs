use log::{info, error};
use log::LevelFilter;

#[allow(non_snake_case)]
pub mod android {
    extern crate jni;
    use self::jni::objects::JClass;
    use self::jni::sys::jstring;
    use self::jni::JNIEnv;
    use super::*;
    #[no_mangle]
    pub unsafe extern "C" fn Java_com_thrombe_covau_Covau_serve<'local>(
        env: JNIEnv<'local>,
        // This is the class that owns our static method. It's not going to be used,
        // but still must be present to match the expected signature of a static
        // native method.
        _class: JClass<'local>,
    ) -> jstring {
        android_logger::init_once(android_logger::Config::default().with_max_level(log::LevelFilter::Trace));

        covau::serve();

        // Then we have to create a new Java string to return. Again, more info
        // in the `strings` module.
        let output = env
            .new_string(format!("Hello, from rust!"))
            .expect("Couldn't create java string!");

        // Finally, extract the raw pointer to return.
        output.into_raw()
    }
}
