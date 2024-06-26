{
  description = "yaaaaaaaaaaaaaaaaaaaaa";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-23.11";
    nixpkgs-unstable.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";

    webui-git = {
      url = "github:webui-dev/webui/2.4.2";
      flake = false;
    };
  };

  outputs = inputs:
    inputs.flake-utils.lib.eachDefaultSystem (system: let
      flakePackage = flake: package: flake.packages."${system}"."${package}";
      flakeDefaultPackage = flake: flakePackage flake "default";

      pkgs = import inputs.nixpkgs {
        inherit system;
        overlays = [
          (final: prev: {
            unstable = import inputs.nixpkgs-unstable {
              inherit system;
            };
          })
        ];
      };

      meta = with pkgs.lib; {
        homepage = manifest.repository;
        # description = manifest.description;
        license = licenses.mit;
        # platforms = platforms.linux;
      };
      manifest = (pkgs.lib.importTOML ./Cargo.toml).package;

      yarn-lock = pkgs.stdenv.mkDerivation {
        name = "yarn.lock";

        src = ./.;

        buildPhase = ''
          cd electron
          bun i -y --frozen-lockfile --production --dry-run
        '';
        installPhase = ''
          mkdir $out
          mv ./yarn.lock $out/.
        '';

        nativeBuildInputs = with pkgs; [
          unstable.bun
        ];
      };
      yarn-deps = pkgs.fetchYarnDeps {
        yarnLock = yarn-lock + /yarn.lock;
        hash = "sha256-c4ictJfi9S8TgXBkAZ9JkSHAquusGj2aqCVEwVO9Vt8=";
      };
      yarn-modules = pkgs.unstable.mkYarnModules {
        pname = "yarn-modules";
        version = "0.0";
        yarnLock = yarn-lock + /yarn.lock;
        # yarnLock = ./electron + /yarn.lock;
        packageJSON = ./electron/package.json;
      };
      electron-dist = pkgs.stdenv.mkDerivation {
        name = "electron-dist";

        src = ./.;

        buildPhase = ''
          # export UI_BACKEND="ELECTRON"
          export UI_BACKEND="WEBUI"
          # export UI_BACKEND="TAURI"
          # export UI_BACKEND="NONE"
          export BUILD_MODE="PRODUCTION"

          export SERVER_PORT=6173
          export WEBUI_PORT=6174
          export DEV_VITE_PORT=6175

          cd electron
          ln -s ${yarn-modules}/node_modules ./node_modules
          bun run build
          cd ..
        '';
        installPhase = ''
          mkdir $out
          mv ./electron/dist $out/.
        '';

        nativeBuildInputs = with pkgs; [
          unstable.bun
        ];
      };
      covau-app = pkgs.unstable.rustPlatform.buildRustPackage rec {
        pname = manifest.name;
        version = manifest.version;
        cargoLock = {
          lockFile = ./Cargo.lock;
          outputHashes = {
           "webui-rs-0.1.0" = "sha256-iyrS3cRFgawMN9JYVkaOn/FBXHLAUphq7XrEnLZFPjQ=";
          };
        };
        src = pkgs.lib.cleanSource ./.;

        buildPhase = ''
          # export UI_BACKEND="ELECTRON"
          export UI_BACKEND="WEBUI"
          # export UI_BACKEND="TAURI"
          # export UI_BACKEND="NONE"
          export BUILD_MODE="PRODUCTION"

          export SERVER_PORT=6173
          export WEBUI_PORT=6174
          export DEV_VITE_PORT=6175

          cd electron
          ln -s ${yarn-modules}/node_modules ./node_modules

          bun run build

          cd ..
          cargo build --release --locked --offline -Z unstable-options --out-dir ./.
        '';
        installPhase = ''
          mkdir -p $out/bin
          mv ./${pname} $out/bin/.
        '';

        buildInputs = with pkgs; [
          openssl
          webui

          # gst_all_1.gstreamer
          # gst_all_1.gst-plugins-base
          # gst_all_1.gst-plugins-good
          # gst_all_1.gst-plugins-bad
          # gst_all_1.gst-plugins-ugly
          # # Plugins to reuse ffmpeg to play almost every video format
          # gst_all_1.gst-libav
          # # Support the Video Audio (Hardware) Acceleration API
          # gst_all_1.gst-vaapi

          mpv
        ];

        nativeBuildInputs = with pkgs; [
          unstable.bun

          pkg-config

          sqlite
        ];

        inherit meta;
      };
      webui = stdenv.mkDerivation {
        name = "webui";
        src = inputs.webui-git;

        buildPhase = ''
          make release
        '';
        installPhase = ''
          mkdir -p $out/lib
          mv ./dist/* $out/lib/.
        '';

        buildInputs = with pkgs; [
          openssl
        ];

        nativeBuildInputs = with pkgs; [
          pkg-config
        ];
      };

      fhs = pkgs.buildFHSEnv {
        name = "fhs-shell";
        targetPkgs = p: (env-packages p) ++ (custom-commands p);
        runScript = "${pkgs.zsh}/bin/zsh";
        profile = ''
          export FHS=1
          # source ./.venv/bin/activate
          # source .env
        '';
      };
      custom-commands = pkgs: [
        (pkgs.writeShellScriptBin "build-wasm" ''
          #!/usr/bin/env bash
          cd $PROJECT_ROOT

          cargo build --lib --target wasm32-unknown-unknown --features wasmdeps
          rm -r ./electron/src/wasm
          wasm-bindgen --web --out-dir ./electron/src/wasm ./target/wasm32-unknown-unknown/debug/covau_app_wasm.wasm
        '')
        (pkgs.writeShellScriptBin "build-wasm-pack" ''
          #!/usr/bin/env bash
          cd $PROJECT_ROOT

          wasm-pack build --target web --features wasmdeps
          rm -r ./electron/src/wasm
          mv ./pkg ./electron/src/wasm
        '')

        (pkgs.writeShellScriptBin "web-dev" ''
          #!/usr/bin/env bash
          cd $PROJECT_ROOT

          cd electron
          bun run dev
        '')
        (pkgs.writeShellScriptBin "wasm-dev" ''
          #!/usr/bin/env bash
          cd $PROJECT_ROOT

          build-wasm

          inotifywait -q -m -e close_write --format %e -r ./src |
          while read events; do
            build-wasm
          done
        '')
        (pkgs.writeShellScriptBin "run" ''
          #!/usr/bin/env bash
          cd $PROJECT_ROOT

          cargo run --bin covau-app --features bindeps
        '')
      ];

      env-packages = pkgs:
        with pkgs;
          [
            unstable.rust-analyzer
            unstable.rustfmt
            unstable.clippy
            # unstable.rustup

            unstable.electron_29
            # unstable.yarn

            nodePackages_latest.svelte-language-server
            nodePackages_latest.typescript-language-server
            tailwindcss-language-server

            unstable.wasm-pack
            lld
            # unstable.cargo-binutils
            # unstable.cargo-llvm-cov
            # unstable.rustc.llvmPackages.llvm

            # manually generate bindings
            unstable.wasm-bindgen-cli
          ]
          ++ (custom-commands pkgs);

      # stdenv = pkgs.clangStdenv;
      stdenv = pkgs.gccStdenv;
    in {
      packages = {
        default = covau-app;
        inherit covau-app;
      };

      devShells.default =
        pkgs.mkShell.override {
          inherit stdenv;
        } {
          nativeBuildInputs = (env-packages pkgs) ++ [fhs];
          inputsFrom = [
            covau-app
          ];
          shellHook = ''
            export PROJECT_ROOT="$(pwd)"

            export RUST_BACKTRACE="1"

            # $(pwd) always resolves to project root :)
            export CLANGD_FLAGS="--compile-commands-dir=$(pwd)/plugin --query-driver=$(which $CXX)"

            # export UI_BACKEND="ELECTRON"
            # export UI_BACKEND="WEBUI"
            # export UI_BACKEND="TAURI"
            export UI_BACKEND="NONE"
            export BUILD_MODE="DEV"
            # export BUILD_MODE="PRODUCTION"

            export SERVER_PORT=6173
            export WEBUI_PORT=6174
            export DEV_VITE_PORT=6175

            export CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_LINKER="lld"
          '';
        };
    });
}
