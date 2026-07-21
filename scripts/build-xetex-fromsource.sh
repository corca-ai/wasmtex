#!/usr/bin/env bash
# Build the XeLaTeX engine (wasmtex-xetex + dvipdfmx) with this project's OWN glue.
#
#   • wasmtex-xetex — built FROM TeX-Live/texlive-source (Docker, wasm-build/
#     Dockerfile.xetex): real libkpathsea + our fontconfig shim + own worker controller.
#     ICU data is NOT bundled — the worker fetches
#     icudt68l.dat from the CDN at runtime (see wasm-build/icu-data-loader.c and
#     scripts/build-icu-data.sh for producing/hosting that asset).
#   • wasmtex-dvipdfm — built FROM TeX-Live/texlive-source too (same Docker image
#     as xetex), with our own controller/library + real libkpathsea.
#     wasm-build/build-dvipdfm2.sh does the emcc build.
#
# The compiled .wasm are the GPL TeX engines; all JS glue is this repo's own (no AGPL).
#
#   ⚠ Build on x86_64 Linux with Docker. The xetex stage runs the texlive-source build
#     (native codegen + emcc).
#
# Usage:
#   scripts/build-xetex-fromsource.sh [OUT_DIR]      # default wasm-build/dist-xetex
set -euo pipefail

OUT_DIR="${1:-wasm-build/dist-xetex}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

command -v docker >/dev/null || { echo "docker required"; exit 1; }
cd "$REPO_ROOT"
mkdir -p "$OUT_DIR"
OUT_ABS="$(cd "$OUT_DIR" && pwd)"

# =============================================================================
# 1) wasmtex-xetex — from texlive-source (Dockerfile.xetex: Phase 1 native +
#    Phase 2 emcc). Build context is wasm-build/ (the Dockerfile COPYs the glue).
# =============================================================================
TEXLIVE_REF="$(cat wasm-build/texlive-source.ref)"
echo "Building wasmtex-xetex from texlive-source ($TEXLIVE_REF) ..."
docker build -f wasm-build/Dockerfile.xetex --platform linux/amd64 \
  --build-arg TEXLIVE_REF="$TEXLIVE_REF" -t wasmtex-xetex-wasm wasm-build/

echo "Checking XeTeX PDF inclusion geometry ..."
docker run --rm --platform linux/amd64 \
  -v "$REPO_ROOT/scripts/test-xetex-pdf-geometry.mjs:/test-xetex-pdf-geometry.mjs:ro" \
  -v "$REPO_ROOT/wasm-build/pdf-backend/fixtures/xetex-geometry.expected.json:/xetex-geometry.expected.json:ro" \
  --entrypoint node wasmtex-xetex-wasm \
  /test-xetex-pdf-geometry.mjs /build/native/texk/web2c/xetex /xetex-geometry.expected.json

echo "Checking deterministic XeTeX PDF inclusion XDV ..."
docker run --rm --platform linux/amd64 --tmpfs /work \
  -v "$REPO_ROOT/scripts/build-xetex-pdf-visual-fixture.mjs:/fixture.mjs:ro" \
  -v "$REPO_ROOT/wasm-build/pdf-backend/fixtures/xetex-visual.expected.sha256:/expected.sha256:ro" \
  --entrypoint sh wasmtex-xetex-wasm -c '
    set -eu
    node /fixture.mjs /build/native/texk/web2c/xetex /work
    cd /work
    sha256sum -c /expected.sha256
  '

docker run --rm --platform linux/amd64 -v "$OUT_ABS:/dist" wasmtex-xetex-wasm
[ -f "$OUT_DIR/wasmtex-xetex.wasm" ] || { echo "xetex build produced no wasm"; exit 1; }
echo "Built: $(wc -c < "$OUT_DIR/wasmtex-xetex.js") + $(wc -c < "$OUT_DIR/wasmtex-xetex.wasm") bytes"

# =============================================================================
# 2) wasmtex-dvipdfm — from texlive-source (XDV->PDF), in the SAME image as
#    xetex (it already has /src/texlive-source + emsdk). Own glue + real
#    libkpathsea. wasm-build/build-dvipdfm2.sh does the emcc build
#    (it reads its glue from /src and writes the engine to /dist).
# =============================================================================
echo "Building wasmtex-dvipdfm from texlive-source ..."
docker run --rm --platform linux/amd64 --entrypoint bash \
  -v "$REPO_ROOT/wasm-build:/glue:ro" -v "$OUT_ABS:/dist" wasmtex-xetex-wasm -c '
    set -euo pipefail
    cp /glue/dvipdfm-entry.c /glue/dvipdfm-stubs.c /glue/kpse-hook.c \
       /glue/build-dvipdfm2.sh /glue/dvipdfm-worker.js \
       /glue/xetex-dvipdfm-library.js /src/
    bash /src/build-dvipdfm2.sh
  '
[ -f "$OUT_DIR/wasmtex-dvipdfm.wasm" ] || { echo "dvipdfm build produced no wasm"; exit 1; }
echo "Built: $(wc -c < "$OUT_DIR/wasmtex-dvipdfm.js") + $(wc -c < "$OUT_DIR/wasmtex-dvipdfm.wasm") bytes"

echo ""
echo "XeLaTeX engine (own controller and glue) in $OUT_DIR:"
echo "  wasmtex-xetex   — from texlive-source; fetches ICU data from the CDN"
echo "  wasmtex-dvipdfm — from texlive-source; loads pdftex.map + fonts from the CDN"
echo "Deploy next to the pdfTeX engine. Ensure icudt68l.dat is on the CDN (scripts/build-icu-data.sh)."
