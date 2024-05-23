{
  description = "yaaaaaaaaaaaaaaaaaaaaa";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-23.11";
    nixpkgs-unstable.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
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
      # manifest = (pkgs.lib.importTOML ./Cargo.toml).package;
      # hyprkool-rs = pkgs.unstable.rustPlatform.buildRustPackage {
      #   pname = manifest.name;
      #   version = manifest.version;
      #   cargoLock = {
      #     lockFile = ./Cargo.lock;
      #     outputHashes = {
      #       "hyprland-0.4.0-alpha.2" = "sha256-7GRj0vxsQ4ORp0hSBAorjFYvWDy+edGU2IL3DhFDLvQ=";
      #     };
      #   };
      #   src = pkgs.lib.cleanSource ./.;

      #   nativeBuildInputs = with pkgs; [
      #     pkg-config
      #   ];

      #   inherit meta;
      # };
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
          ]
          ++ (custom-commands pkgs);

      stdenv = pkgs.clangStdenv;
      # stdenv = pkgs.gccStdenv;
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
            # hyprkool-rs
            # hyprkool-plugin
          ];
          shellHook = ''
            export PROJECT_ROOT="$(pwd)"

            export RUST_BACKTRACE="1"

            # $(pwd) always resolves to project root :)
            export CLANGD_FLAGS="--compile-commands-dir=$(pwd)/plugin --query-driver=$(which $CXX)"
          '';
        };
    });
}
