#!/usr/bin/env bash
# =============================================================================
# build.sh — WASM build script for pdfTeX with SyncTeX
# =============================================================================
#
# This script is the Docker ENTRYPOINT. Phase 1 (native build) is baked into
# the Docker image, so this script only runs Phase 2 (WASM compilation).
#
# Usage:
#   docker build --platform linux/amd64 -t pdftex-wasm .
#   docker run --platform linux/amd64 -v $(pwd)/dist:/dist pdftex-wasm
#
# Output:
#   /dist/wasmtex-pdftex.worker.js — authored worker controller
#   /dist/wasmtex-pdftex.js    — generated Emscripten module
#   /dist/wasmtex-pdftex.wasm  — WebAssembly binary (~3-5MB)
#
# =============================================================================
set -euo pipefail

BUILD_START=$(date +%s)

echo "============================================================"
echo "  pdfTeX WASM Build — with SyncTeX Support"
echo "============================================================"
echo ""
echo "  Emscripten version: $(emcc --version | head -1)"
echo "  Source:             TeX Live 2025 (pdfTeX 1.40.28)"
echo "  SyncTeX:            enabled"
echo ""

# Verify Phase 1 artifacts exist (baked into image)
echo "Checking Phase 1 (native) artifacts..."
if ls /build/native/texk/web2c/pdftex0.c \
      /build/native/texk/web2c/pdftexini.c \
      /build/native/texk/web2c/pdftex-pool.c \
      /build/native/texk/web2c/pdftexd.h >/dev/null 2>&1; then
    echo "  Native C files found (from image build)."
else
    echo "  ERROR: Native C files not found. Rebuild the Docker image."
    exit 1
fi
echo ""

# ---------------------------------------------------------------------------
# Phase 2: WASM build — compile pdfTeX + SyncTeX with Emscripten
# ---------------------------------------------------------------------------

echo "============================================================"
echo "  Phase 2: WASM build (compiling with Emscripten)"
echo "============================================================"
echo ""

echo "--- Step 1/4: WASM configure ---"
make -f /src/Makefile wasm-configure
echo ""

echo "--- Step 2/4: WASM libraries (kpathsea, zlib, libpng, xpdf) ---"
make -f /src/Makefile wasm-libs
echo ""

echo "--- Step 3/4: Prepare native files ---"
make -f /src/Makefile wasm-prep
echo ""

echo "--- Step 4/4: Final emcc compile ---"
make -f /src/Makefile wasm-compile
echo ""

echo "--- Packaging pdfTeX output ---"
make -f /src/Makefile dist
echo ""

# ---------------------------------------------------------------------------
# BibTeX WASM build (optional — requires Phase 1 with --enable-bibtex)
# ---------------------------------------------------------------------------

if ls /build/native/texk/web2c/bibtex.c >/dev/null 2>&1; then
    echo "============================================================"
    echo "  BibTeX WASM build"
    echo "============================================================"
    echo ""
    echo "--- BibTeX: compile ---"
    if make -f /src/Makefile bibtex-wasm-compile; then
        echo ""
        ls -lh /dist/wasmtex-bibtex.* 2>/dev/null || echo "  (BibTeX output files missing)"
    else
        echo ""
        echo "  WARNING: BibTeX WASM build failed (non-fatal)"
    fi
else
    echo "Skipping BibTeX WASM build (no bibtex.c from Phase 1)."
    echo "To build BibTeX, rebuild Docker image with --enable-bibtex in Phase 1."
fi
echo ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

BUILD_END=$(date +%s)
TOTAL_TIME=$((BUILD_END - BUILD_START))

echo ""
echo "============================================================"
echo "  Build Complete — ${TOTAL_TIME} seconds"
echo "============================================================"
echo ""
echo "  Output files in /dist/:"
ls -lh /dist/wasmtex-pdftex.* 2>/dev/null || echo "  (no pdfTeX output files found)"
ls -lh /dist/wasmtex-bibtex.* 2>/dev/null || echo "  (no BibTeX output — Phase 1 needs --enable-bibtex)"
echo ""
echo "  To use in the editor:"
echo "    cp dist/wasmtex-pdftex.* public/wasmtex/<version>/"
echo "    cp dist/wasmtex-kpse-resolve.js public/wasmtex/<version>/"
echo "    cp dist/wasmtex-bibtex.* public/wasmtex/<version>/  (if built)"
echo ""
