fn main() {
    println!("cargo::rustc-check-cfg=cfg(build_mode, values(\"DEV\", \"PROD\"))");

    println!("cargo:rerun-if-env-changed=BUILD_MODE");
    match std::env::var("BUILD_MODE") {
        Ok(s) => {
            println!("cargo:rustc-cfg=build_mode=\"{}\"", s);
        }
        Err(_) => {
            panic!("BUILD_MODE env not set");
        }
    }
}
