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
  "$REPO_ROOT/wasm-build" || { echo "LuaHBTeX image build failed"; exit 1; }

echo "Checking repeated PDF image inclusion (WTPDF lifetime gate) ..."
# Runs the native Phase-1 luahbtex against the repeat-image fixture: the same
# classic-xref and xref/object-stream inputs are each opened twice and shipped
# out, exercising open -> geometry -> embed -> close across document reuse.
# Several iterations because lifetime bugs here are address-layout dependent
# (an uninitialized memstream pointer crashed only on some ASLR layouts).
docker run --rm --platform linux/amd64 --tmpfs /work \
  -v "$REPO_ROOT/scripts/generate-pdf-compat-fixtures.mjs:/gen-fixtures.mjs:ro" \
  -v "$REPO_ROOT/wasm-build/pdf-backend/fixtures/luahbtex-repeat-image.tex:/luahbtex-repeat-image.tex:ro" \
  --entrypoint sh "$IMAGE" -c '
    set -eu
    node /gen-fixtures.mjs /work
    cd /work
    cp /luahbtex-repeat-image.tex .
    for attempt in 1 2 3 4 5; do
      rm -f luahbtex-repeat-image.pdf
      TEXINPUTS=. TEXMFOUTPUT=/work /build/native/texk/web2c/luahbtex \
        --ini --interaction=nonstopmode luahbtex-repeat-image.tex \
        >repeat-image.out 2>&1 || {
          tail -30 repeat-image.out
          echo "repeat-image gate failed (attempt $attempt)"; exit 1
        }
      grep -q WASMTEX_REPEAT_IMAGE_OK repeat-image.out || {
        tail -30 repeat-image.out
        echo "repeat-image gate: missing OK marker (attempt $attempt)"; exit 1
      }
      head -c 5 luahbtex-repeat-image.pdf | grep -q "%PDF-" || {
        echo "repeat-image gate: no output PDF (attempt $attempt)"; exit 1
      }
    done
  ' || { echo "LuaHBTeX repeat-image gate failed"; exit 1; }

echo "Running Phase 2 (emcc cross-compile + glue relink) ..."
docker run --rm --platform linux/amd64 \
  -v "$REPO_ROOT/$OUT_DIR":/dist \
  "$IMAGE"

echo ""
echo "LuaHBTeX build outputs in $OUT_DIR:"
ls -lh "$REPO_ROOT/$OUT_DIR"/wasmtex-luatex.* 2>/dev/null \
  || { echo "  ERROR: no wasmtex-luatex.wasm produced — see build log above"; exit 1; }
