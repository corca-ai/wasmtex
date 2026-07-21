# =============================================================================
# Dockerfile: pdfTeX WASM with SyncTeX — Build Environment
# =============================================================================
#
# Builds pdfTeX 1.40.28 as a WebAssembly module using Emscripten, with SyncTeX
# support enabled. The output is a generated module, WASM binary, and separately
# published authored worker controller.
#
# ARCHITECTURE NOTE:
# The native build (Phase 1) is baked into the Docker image using INLINED
# commands — NOT referencing any COPY'd files. This means changes to the
# Makefile, build.sh, or pdftex-worker.js do NOT invalidate the 82-minute
# native build cache. Only Phase 2 (WASM) runs at `docker run` time.
#
# Usage:
#   docker build --platform linux/amd64 -t pdftex-wasm .
#   docker run --platform linux/amd64 -v $(pwd)/dist:/dist pdftex-wasm
#
# The final artifacts land in /dist (mounted as a host volume):
#   - wasmtex-pdftex.worker.js (authored worker controller)
#   - wasmtex-pdftex.js   (generated Emscripten module)
#   - wasmtex-pdftex.wasm (WebAssembly binary)
#
# =============================================================================

FROM emscripten/emsdk:3.1.46@sha256:2491bc4bf6caf8c41993660822341bc72759cb577363dfe0781f0a2d05f7d357

LABEL maintainer="wasmtex"
LABEL description="pdfTeX WASM build environment with SyncTeX support (TeX Live 2025)"

# Use bash with pipefail for proper error propagation
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# ---- System packages --------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    autoconf \
    automake \
    libtool \
    pkg-config \
    git \
    ca-certificates \
    wget \
    python3 \
    flex \
    bison \
    ghostscript \
    texinfo \
    && rm -rf /var/lib/apt/lists/*

# ---- TeX Live source (pinned, immutable) ------------------------------------
# pdfTeX 1.40.28 is in TeX Live 2025. Pinned to an immutable commit (a moving
# branch is not reproducible) via the single source of truth wasm-build/
# texlive-source.ref, passed as --build-arg by the build scripts/workflows. No
# default → fails loudly if not supplied (build via the scripts, not bare).
ARG TEXLIVE_REF
RUN test -n "${TEXLIVE_REF}" || { echo "TEXLIVE_REF build-arg is required"; exit 1; }; \
    echo "=== Fetching pinned TeX Live source ${TEXLIVE_REF} ===" && \
    mkdir -p /src/texlive-source && cd /src/texlive-source && \
    git init -q && \
    git remote add origin https://github.com/TeX-Live/texlive-source.git && \
    git fetch --depth 1 -q origin "${TEXLIVE_REF}" && \
    git checkout -q FETCH_HEAD && \
    echo "=== Source checkout complete ($(git rev-parse HEAD)) ==="

# ---- Build directories ------------------------------------------------------
RUN mkdir -p /build/native /build/wasm /dist

# =============================================================================
# Phase 1: Native build (INLINED — does not depend on COPY'd files)
# =============================================================================
# These commands are intentionally inlined (not using the Makefile) so that
# changes to Makefile/build.sh/pdftex-worker.js do NOT invalidate this
# ~82-minute native build cache. The configure flags here are stable and
# match the Makefile's COMMON_CONFIGURE_FLAGS.

RUN echo "=== Phase 1a: Native configure ===" && \
    cd /build/native && \
    /src/texlive-source/configure \
        --disable-all-pkgs \
        --enable-pdftex \
        --enable-bibtex \
        --enable-synctex \
        --enable-web2c \
        --without-x \
        --disable-shared \
        --disable-multiplatform \
        --disable-native-texlive-build \
        --disable-xetex \
        --disable-luatex \
        --disable-luajittex \
        --disable-luahbtex \
        --disable-mf \
        --disable-mp \
        --disable-ptex \
        --disable-eptex \
        --disable-uptex \
        --disable-euptex \
        --without-mf-x-toolkit \
    2>&1 | tail -30

RUN echo "=== Phase 1b: Native build ===" && \
    cd /build/native && make MAKEINFO=true -j"$(nproc)" 2>&1 || true && \
    echo "" && \
    echo "--- Full native build finished (errors in luajittex expected) ---" && \
    echo "" && \
    if [ ! -f "/build/native/texk/web2c/pdftex0.c" ]; then \
        echo "--- pdftex C files not found, retrying targeted pdftex build ---"; \
        cd /build/native/texk/web2c && make pdftex -j"$(nproc)" 2>&1 || true; \
    fi && \
    if [ ! -f "/build/native/texk/web2c/bibtex.c" ]; then \
        echo "--- bibtex C files not found, retrying targeted bibtex build ---"; \
        cd /build/native/texk/web2c && make bibtex -j"$(nproc)" 2>&1 || true; \
    fi && \
    echo "" && \
    echo "=== Verifying generated C files ===" && \
    ls -la /build/native/texk/web2c/pdftex0.c \
           /build/native/texk/web2c/pdftexini.c \
           /build/native/texk/web2c/pdftex-pool.c \
           /build/native/texk/web2c/pdftexd.h && \
    echo "" && \
    echo "=== Verifying bibtex C files ===" && \
    ls -la /build/native/texk/web2c/bibtex* 2>/dev/null || \
        echo "WARNING: no bibtex files found" && \
    echo "=== All web2c bibtex-related files ===" && \
    find /build/native/texk/web2c -name 'bibtex*' -ls 2>/dev/null || true

# =============================================================================
# COPY build scripts (AFTER native build — changes here won't invalidate above)
# =============================================================================
COPY Makefile /src/Makefile
COPY build.sh /src/build.sh
COPY pdftex-worker.js /src/pdftex-worker.js
COPY kpse-resolve.cjs /src/kpse-resolve.cjs
COPY wasm-entry.c /src/wasm-entry.c
COPY kpse-hook.c /src/kpse-hook.c
COPY library.js /src/library.js
COPY trace-hook.c /src/trace-hook.c
COPY bibtex-entry.c /src/bibtex-entry.c
COPY bibtex-worker.js /src/bibtex-worker.js

RUN chmod +x /src/build.sh

WORKDIR /src

# ---- Entrypoint --------------------------------------------------------------
# Only Phase 2 (WASM) runs at `docker run` time.
ENTRYPOINT ["bash", "build.sh"]
