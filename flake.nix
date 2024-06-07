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
        description = manifest.description;
        license = licenses.mit;
        platforms = platforms.linux;
      };
      manifest = (pkgs.lib.importTOML ./Cargo.toml).package;
      covau-app = pkgs.unstable.rustPlatform.buildRustPackage {
        pname = manifest.name;
        version = manifest.version;
        cargoLock = {
          lockFile = ./Cargo.lock;
          outputHashes = {
           "webui-rs-0.1.0" = "";
          };
        };
        src = pkgs.lib.cleanSource ./.;

        buildInputs = with pkgs; [
          openssl
          webui
        ];

        nativeBuildInputs = with pkgs; [
          pkg-config
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
      # plugin-manifest = (pkgs.lib.importTOML ./hyprpm.toml).repository;
      # hyprkool-plugin = stdenv.mkDerivation rec {
      #   pname = plugin-manifest.name;
      #   version = manifest.version;

      #   src = ./.;

      #   dontUseCmakeConfigure = true;
      #   dontUseMesonConfigure = true;
      #   buildPhase = ''
      #     make plugin
      #     mv ./plugin/build/lib${pname}.so .
      #   '';
      #   installPhase = ''
      #     mkdir -p $out/lib
      #     mv ./lib${pname}.so $out/lib/lib${pname}.so
      #   '';

      #   nativeBuildInputs = with pkgs; [
      #     pkg-config
      #     (flakeDefaultPackage inputs.hyprland).dev
      #     unstable.clang
      #     # unstable.gcc
      #   ];
      #   buildInputs = with pkgs;
      #     [
      #       cmake
      #       meson
      #       ninja
      #     ]
      #     ++ (flakeDefaultPackage inputs.hyprland).buildInputs;

      #   inherit meta;
      # };

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
        (pkgs.writeShellScriptBin "kool-meson-configure" ''
          #!/usr/bin/env bash
          cd $PROJECT_ROOT

          # make plugin-meson-configure
        '')
      ];

      env-packages = pkgs:
        with pkgs;
          [
            unstable.rust-analyzer
            unstable.rustfmt
            unstable.clippy
            # unstable.rustup

            unstable.bun
            unstable.electron_29

            nodePackages_latest.svelte-language-server
            nodePackages_latest.typescript-language-server
            tailwindcss-language-server

            gst_all_1.gstreamer
            gst_all_1.gst-plugins-base
            gst_all_1.gst-plugins-good
            gst_all_1.gst-plugins-bad
            gst_all_1.gst-plugins-ugly
            # Plugins to reuse ffmpeg to play almost every video format
            gst_all_1.gst-libav
            # Support the Video Audio (Hardware) Acceleration API
            gst_all_1.gst-vaapi

            mpv

            sqlite
          ]
          ++ (custom-commands pkgs);

      # stdenv = pkgs.clangStdenv;
      stdenv = pkgs.gccStdenv;
    in {
      packages = {
        # default = hyprkool-rs;
        # inherit hyprkool-rs hyprkool-plugin;
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
            export UI_BACKEND="WEBUI"
            # export UI_BACKEND="TAURI"
            export BUILD_MODE="DEV"
            # export BUILD_MODE="PRODUCTION"
          '';
        };
    });
}
