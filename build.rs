
fn main() {
    println!("cargo:rerun-if-env-changed=UI_BACKEND");
    match std::env::var("UI_BACKEND") {
        Ok(s) => {
            println!("cargo:rustc-cfg=ui_backend=\"{}\"", s);
        },
        Err(_) => {
            panic!("UI_BACKEND env not set");
        },
    }

    println!("cargo:rerun-if-env-changed=BUILD_MODE");
    match std::env::var("BUILD_MODE") {
        Ok(s) => {
            println!("cargo:rustc-cfg=build_mode=\"{}\"", s);
        },
        Err(_) => {
            panic!("BUILD_MODE env not set");
        },
    }
}
