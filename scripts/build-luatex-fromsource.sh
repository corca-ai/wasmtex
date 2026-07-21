#!/usr/bin/env bash
# Build the LuaHBTeX WASM engine FROM SOURCE with this repo's OWN glue.
#
# This is a from-texlive-source port driven by wasm-build/Dockerfile.luatex:
#   Phase 1 (native, cached in the image): generate luatex's C sources + the web2c
#           codegen tools (ctangle/tangle/web2c) and build the native libs.
#   Phase 2 (emcc, at `docker run`):       cross-compile + link with the own glue,
#           reusing the native-generated C and tools (build-luatex.sh).
#
# Validated end-to-end: builds the lualatex format and compiles a real document
# (incl. math + CDN font fetch) to a valid PDF. The output is GPL LuaTeX engine +
# this repo's own glue — no AGPL.
#
#   ⚠ Build on x86_64 Linux with Docker (emscripten/emsdk). Do NOT build on Apple
#     Silicon (the amd64 emcc toolchain runs under slow qemu emulation).
#
# Usage:
#   scripts/build-luatex-fromsource.sh [OUT_DIR]     # default wasm-build/dist-luatex
set -uo pipefail

OUT_DIR="${1:-wasm-build/dist-luatex}"
IMAGE="${LUATEX_IMAGE:-luatex-wasm}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

command -v docker >/dev/null || { echo "docker required"; exit 1; }

mkdir -p "$REPO_ROOT/$OUT_DIR"

echo "Building LuaHBTeX build image (Phase 1 native is cached) ..."
docker build --platform linux/amd64 \
  --build-arg TEXLIVE_REF="$(cat "$REPO_ROOT/wasm-build/texlive-source.ref")" \
  -f "$REPO_ROOT/wasm-build/Dockerfile.luatex" \
  -t "$IMAGE" \
  "$REPO_ROOT/wasm-build"

echo "Running Phase 2 (emcc cross-compile + glue relink) ..."
docker run --rm --platform linux/amd64 \
  -v "$REPO_ROOT/$OUT_DIR":/dist \
  "$IMAGE"

echo ""
echo "LuaHBTeX build outputs in $OUT_DIR:"
ls -lh "$REPO_ROOT/$OUT_DIR"/wasmtex-luatex.* 2>/dev/null \
  || { echo "  ERROR: no wasmtex-luatex.wasm produced — see build log above"; exit 1; }
