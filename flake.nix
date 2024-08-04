{
  description = "yaaaaaaaaaaaaaaaaaaaaa";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-24.05";
    nixpkgs-unstable.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";

    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    webui-git = {
      url = "github:webui-dev/webui/2.5.0-beta.1";
      flake = false;
    };

    libmpv-windows = {
      url = "https://sourceforge.net/projects/mpv-player-windows/files/libmpv/mpv-dev-x86_64-20211128-git-f08db00.7z/download";
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

      # - [Cross compilation — nix.dev documentation](https://nix.dev/tutorials/cross-compilation.html)
      # - [Cross Compile Rust for Windows - Help - NixOS Discourse](https://discourse.nixos.org/t/cross-compile-rust-for-windows/9582/7)
      # windows-pkgs = inputs.nixpkgs.legacyPackages.x86_64-linux.pkgsCross.mingw32;
      # windows-pkgs = inputs.nixpkgs.legacyPackages.x86_64-linux.pkgsCross.mingwW64;
      windows-pkgs = import inputs.nixpkgs {
        localSystem = "x86_64-linux";
        crossSystem.config = "x86_64-w64-mingw32";
      };
      # windows-pkgs = import inputs.nixpkgs {
      #   localSystem = "x86_64-linux";
      #   crossSystem.config = "x86_64-w64-mingwW64";
      # };
      rust-bin = inputs.rust-overlay.lib.mkRustBin { } windows-pkgs.buildPackages;
      windows-webui = windows-pkgs.stdenv.mkDerivation {
        name = "webui";
        src = windows-pkgs.fetchzip {
          url = "https://github.com/webui-dev/webui/releases/download/2.4.2/webui-windows-gcc-x64.zip";
          sha256 = "sha256-8QmPas4q0Yce78Srx837bjUYo+DQ6ZAsiy4jL0G5Ldk=";
        };

        phases = ["installPhase"];
        installPhase = ''
          mkdir -p $out/lib
          mkdir -p $out/include
          # cp $src/debug/libwebui-2-static.a
          # cp $src/debug/webui-2.dll
          cp $src/include/webui.h $out/include/.
          cp $src/include/webui.hpp $out/include/.
          cp $src/libwebui-2-static.a $out/lib/.
          cp $src/webui-2.dll $out/lib/.
        '';
      };
      windows-mpv = windows-pkgs.stdenv.mkDerivation {
        name = "libmpv";
        src = inputs.libmpv-windows;

        phases = ["installPhase"];
        installPhase = ''
          mkdir -p $out/lib
          cd $out

          ${pkgs.p7zip}/bin/7z x $src

          # mv libmpv-2.dll ./lib/.
          mv libmpv.dll.a ./lib/.
          mv mpv-1.dll ./lib/.
          
        '';
      };
      windows-shell = windows-pkgs.mkShell {
        nativeBuildInputs = [
          rust-bin.stable.latest.minimal
          windows-pkgs.buildPackages.pkg-config
          windows-pkgs.openssl
        ];

        depsBuildBuild = [];
        buildInputs = [
          windows-pkgs.buildPackages.pkg-config
          windows-pkgs.openssl
          windows-pkgs.windows.mingw_w64_pthreads
          windows-pkgs.windows.pthreads
          windows-webui
          windows-mpv
        ];

        env = {
          CARGO_BUILD_TARGET = "x86_64-pc-windows-gnu";
        };
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
          # export UI_BACKEND="WEBUI"
          # export UI_BACKEND="TAURI"
          export UI_BACKEND="QWEB"
          # export UI_BACKEND="NONE"
          export BUILD_MODE="PROD"

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
          # export UI_BACKEND="WEBUI"
          # export UI_BACKEND="TAURI"
          export UI_BACKEND="QWEB"
          # export UI_BACKEND="NONE"
          export BUILD_MODE="PROD"

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
          qweb

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
      webui = pkgs.gccStdenv.mkDerivation {
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
      qweb = pkgs.clangStdenv.mkDerivation {
        name = "covau-qweb";
        src = ./qweb;

        buildPhase = ''
          cmake
          make
        '';
        installPhase = ''
          mkdir -p $out/bin
          mkdir -p $out/lib
          mv ./qweb $out/bin/.
          mv ./libqweb.so $out/lib/.
          # mv ./libqweb.a $out/lib/.
        '';

        buildInputs = with pkgs; [
          qt6.qtbase
          qt6.full
          # kdePackages.qtwebview
          # kdePackages.qtwebengine
          # kdePackages.qtdeclarative
          # kdePackages.qtwayland
        ];

        nativeBuildInputs = with pkgs; [
          pkg-config
          cmake
          qt6.wrapQtAppsHook
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

          cargo run --bin covau-app --features bindeps -- $@
        '')
        (pkgs.writeShellScriptBin "check" ''
          #!/usr/bin/env bash
          cd $PROJECT_ROOT

          cargo check --bin covau-app --features bindeps
        '')
        (pkgs.writeShellScriptBin "build-prod" ''
          #!/usr/bin/env bash
          export BUILD_MODE="PROD"

          export UI_BACKEND="QWEB"
          export SERVER_PORT=6176

          cd $PROJECT_ROOT/qweb
          mkdir -p ./build
          cd ./build
          cmake -CMAKE_BUILD_TYPE=Release ..
          make

          cd $PROJECT_ROOT/electron
          bun run build

          cd $PROJECT_ROOT
          cargo build --release --bin covau-app --features bindeps
        '')
        (pkgs.writeShellScriptBin "build-qweb" ''
          #!/usr/bin/env bash
          cd $PROJECT_ROOT
          cd qweb
          mkdir -p ./build

          cd ./build
          cmake $@ ..
          make
        '')
        (pkgs.writeShellScriptBin "run-qweb" ''
          #!/usr/bin/env bash
          build-qweb -DCMAKE_BUILD_TYPE=Release
          $PROJECT_ROOT/qweb/build/qweb $@
        '')
        (pkgs.writeShellScriptBin "run-covau-qweb" ''
          #!/usr/bin/env bash
          build-qweb -DCMAKE_BUILD_TYPE=Release
          PATH=$PROJECT_ROOT/qweb/build:$PATH run qweb
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

      stdenv = pkgs.clangStdenv;
      # stdenv = pkgs.gccStdenv;
    in {
      packages = {
        qweb = qweb;
        default = covau-app;
        inherit covau-app;
      };

      devShells.windows = windows-shell;
      devShells.qt = pkgs.mkShell.override {
        inherit stdenv;
      } {
        nativeBuildInputs = (env-packages pkgs) ++ [fhs];
        inputsFrom = [
          covau-app
          qweb
        ];

        buildInputs = with pkgs; [
          qtcreator
          qweb

          # this is for the shellhook portion
          qt6.wrapQtAppsHook
          makeWrapper
          bashInteractive
        ];

        # - [(Qt)Quick C++ Project Setup with Nix](https://galowicz.de/2023/01/16/cpp-qt-qml-nix-setup/)
        # set the environment variables that Qt apps expect
        shellHook = ''
          # - [Qt WebEngine Debugging and Profiling | Qt WebEngine 6.7.2](https://doc.qt.io/qt-6/qtwebengine-debugging.html#qt-webengine-developer-tools)
          export QTWEBENGINE_REMOTE_DEBUGGING=6178

          bashdir=$(mktemp -d)
          makeWrapper "$(type -p bash)" "$bashdir/bash" "''${qtWrapperArgs[@]}"
          exec "$bashdir/bash"
        '';
      };
      devShells.default =
        pkgs.mkShell.override {
          inherit stdenv;
        } {
          nativeBuildInputs = (env-packages pkgs) ++ [fhs];
          inputsFrom = [
            covau-app
            qweb
          ];
          shellHook = ''
            export PROJECT_ROOT="$(pwd)"

            export RUST_BACKTRACE="1"

            # $(pwd) always resolves to project root :)
            export CLANGD_FLAGS="--compile-commands-dir=$(pwd)/plugin --query-driver=$(which $CXX)"

            # export UI_BACKEND="ELECTRON"
            # export UI_BACKEND="WEBUI"
            # export UI_BACKEND="TAURI"
            # export UI_BACKEND="QWEB"
            export UI_BACKEND="NONE"
            export BUILD_MODE="DEV"
            # export BUILD_MODE="PROD"

            export SERVER_PORT=6173
            export WEBUI_PORT=6174
            export DEV_VITE_PORT=6175

            export CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_LINKER="lld"

            export PATH=$PROJECT_ROOT/qweb/build:$PATH
            export QTWEBENGINE_REMOTE_DEBUGGING=6178

            export QT_SCALE_FACTOR_ROUNDING_POLICY=RoundPreferFloor
            export QT_WAYLAND_DISABLE_WINDOWDECORATION=0
          '';
        };
    });
}
