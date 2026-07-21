#!/usr/bin/env bash
# =============================================================================
# build-luatex.sh — Phase 2 (WASM) for LuaHBTeX. Docker ENTRYPOINT.
# =============================================================================
#
# Phase 1 (native source generation + codegen tools) is baked into the image by
# Dockerfile.luatex at /build/native. This script cross-compiles the LuaHBTeX
# source graph with Emscripten and links it with this repo's OWN glue.
#
# Why the native build is required: web2c translates CWEB/WEB (.w) to C with tools
# (ctangle/tangle/web2c) that must RUN during the build. Under emscripten those
# tools compile to wasm and can't execute, so we reuse the NATIVE-generated C and
# the NATIVE tool binaries (the same two-phase approach proven for pdfTeX).
#
# Output (/dist):
#   wasmtex-luatex.worker.js / .js / .wasm   (single worker; writes PDF directly)
# =============================================================================
set -uo pipefail

NB=/build/native            # native build (Phase 1, baked into image)
WB=/build/wasm              # wasm build (Phase 2, here)
SRC=/src/texlive-source
OUT=/dist
GLUE=/src                   # COPY'd glue + entry + kpse-hook live here

# Engine selection: only LuaHBTeX (+ its libs). Disabling the others avoids
# XeTeX's system fontconfig dep and the MetaPost-standalone math libs.
DISABLES="--disable-pdftex --disable-bibtex --disable-xetex --disable-luatex \
  --disable-luajittex --disable-luajithbtex --disable-mfluajit \
  --disable-mf --disable-mp \
  --disable-ptex --disable-eptex --disable-uptex --disable-euptex"

mkdir -p "$OUT"

echo "=== Phase 2a: emconfigure (luahbtex) ==="
rm -rf "$WB"; mkdir -p "$WB"; cd "$WB"
emconfigure "$SRC/configure" \
  --disable-all-pkgs --enable-web2c --enable-luahbtex $DISABLES \
  --without-x --disable-shared --disable-multiplatform --disable-native-texlive-build \
  >emconf.out 2>&1 || { echo "emconfigure failed"; tail -30 emconf.out; exit 1; }

echo "=== Phase 2a.1: SHA-2 WebAssembly smoke test ==="
emcc -O2 -std=c99 \
  "$GLUE/sha2/wasmtex-sha2.c" \
  "$GLUE/sha2/wasmtex-sha2-smoke.c" \
  -sEXIT_RUNTIME=1 -o /tmp/wasmtex-sha2-smoke.js || {
    echo "SHA-2 WebAssembly smoke-test build failed"
    exit 1
  }
node /tmp/wasmtex-sha2-smoke.js || {
  echo "SHA-2 WebAssembly smoke test failed"
  exit 1
}

echo "=== Phase 2b: trim libs to what luahbtex links ==="
# luahbtex links: zlib lua53 libpng zziplib graphite2 harfbuzz Xpdf. Drop the
# MetaPost/ICU libs (their native codegen tools — gmp gen-fib, icupkg — can't run
# under emscripten, and luahbtex links none of them).
sed -i -E '/^(MAKE_SUBDIRS|CONF_SUBDIRS)/ s/\<(mpfr|mpfi|cairo|pixman|potrace|gmp|icu)\>//g' libs/Makefile

echo "=== Phase 2c: build the needed libs (native codegen via CC_FOR_BUILD) ==="
emmake make MAKEINFO=true CC_FOR_BUILD=gcc BUILD_CC=gcc -C libs -j"$(nproc)" \
  >emmake-libs.out 2>&1 || { echo "libs build failed"; tail -30 emmake-libs.out; exit 1; }
XPDFLIB="$(find "$WB/libs/xpdf" -name libxpdf.a | head -1)"
if [ -z "$XPDFLIB" ]; then
  echo "Xpdf was configured but not reached by the recursive libs target; building it explicitly"
  emmake make MAKEINFO=true CC_FOR_BUILD=gcc BUILD_CC=gcc \
    -C "$WB/libs/xpdf" -j"$(nproc)" >emmake-xpdf.out 2>&1 || {
      echo "Xpdf build failed"
      tail -60 emmake-xpdf.out
      exit 1
    }
  XPDFLIB="$(find "$WB/libs/xpdf" -name libxpdf.a | head -1)"
fi
[ -n "$XPDFLIB" ] && [ -s "$XPDFLIB" ] || {
  echo "Xpdf library missing after the LuaHBTeX dependency build"
  exit 1
}

echo "=== Phase 2c.1: WTPDF WebAssembly smoke test ==="
XPDF_INCLUDES=(
  -I"$GLUE/pdf-backend"
  -I"$SRC/libs/xpdf"
  -I"$SRC/libs/xpdf/xpdf-src/goo"
  -I"$SRC/libs/xpdf/xpdf-src/fofi"
  -I"$SRC/libs/xpdf/xpdf-src/xpdf"
  -I"$WB/libs/xpdf"
)
em++ -O2 -std=c++11 -DPDF_PARSER_ONLY \
  "${XPDF_INCLUDES[@]}" \
  "$GLUE/pdf-backend/wtpdf-xpdf.cc" \
  "$GLUE/pdf-backend/wtpdf-smoke.cc" \
  "$XPDFLIB" "$WB/libs/zlib/libz.a" \
  -sEXIT_RUNTIME=1 -o /tmp/wtpdf-smoke.js || {
    echo "WTPDF WebAssembly smoke-test build failed"
    exit 1
  }
node /tmp/wtpdf-smoke.js || {
  echo "WTPDF WebAssembly smoke test failed"
  exit 1
}

echo "=== Phase 2d: configure texk/web2c (top-level make; codegen step fails as wasm — ok) ==="
emmake make MAKEINFO=true CC_FOR_BUILD=gcc BUILD_CC=gcc -j"$(nproc)" >emmake-top.out 2>&1 || true
WW="$WB/texk/web2c"
NW="$NB/texk/web2c"
[ -d "$WW" ] || { echo "web2c not configured"; tail -30 emmake-top.out; exit 1; }

echo "=== Phase 2e: point codegen at NATIVE tools, build luahbtex ==="
# Cross the two-phase boundary without copying tools or juggling timestamps:
#  - the main tangle/web2c rules take the tool as an argument → pass the Phase-1
#    native (x86_64) binaries via CTANGLE/TANGLE/WEB2C make vars;
#  - ctangleboot-sh bakes @CTANGLEBOOT@ (= ./ctangleboot) into the generated script
#    and ignores the var, so rewrite the codegen scripts to call the native paths.
# Codegen then RUNS natively; only compilation goes through emcc.
for s in "$WW"/ctangleboot-sh "$WW"/tangle-sh "$WW"/web2c-sh; do
  [ -f "$s" ] && sed -i \
    -e "s#\./ctangleboot#$NW/ctangleboot#g" \
    -e "s#\./tangleboot#$NW/tangleboot#g" \
    -e "s#\./ctangle#$NW/ctangle#g" \
    -e "s#\./tangle#$NW/tangle#g" \
    -e "s#\./web2c/web2c#$NW/web2c/web2c#g" "$s"
done
emmake make MAKEINFO=true CC_FOR_BUILD=gcc BUILD_CC=gcc \
  CTANGLE="$NW/ctangle" CTANGLEBOOT="$NW/ctangleboot" \
  TANGLE="$NW/tangle" TANGLEBOOT="$NW/tangleboot" \
  WEB2C="$NW/web2c/web2c" \
  -C texk/web2c luahbtex >emmake-luahbtex.out 2>&1 || true  # vanilla final link fails under emcc — we relink next
[ -f "$WW/libluatex.a" ] || { echo "luahbtex objects missing"; tail -50 emmake-luahbtex.out; exit 1; }

echo "=== Phase 2f: final emcc link with WasmTex's own glue ==="
cd "$WW"
emcc -O2 -c "$GLUE/luatex-entry.c" -o luatex-entry.o
emcc -O2 -c "$GLUE/kpse-hook.c"    -o kpse-hook.o
# Interposition contract (#50): kpse_find_file must be defined in libkpathsea, else
# -Wl,--wrap=kpse_find_file below silently no-ops and the CDN file-lookup hook never
# fires. Fail loud on upstream drift. (docs/texlive-upgrade.md interpose-don't-patch)
KPLIB="$(find "$WB/texk/kpathsea" -name libkpathsea.a | head -1)"
# Use a wasm-capable nm (llvm-nm). The system `nm` can't read emscripten archives and
# reports a FALSE absence, so never trust it here. Skip (don't fail) if no wasm-nm is
# available or it reads no symbols — only a working nm that finds NO kpse_find_file is
# real interposition drift.
NM=""
command -v llvm-nm >/dev/null 2>&1 && NM=llvm-nm
[ -z "$NM" ] && command -v emnm >/dev/null 2>&1 && NM=emnm
if [ -z "$NM" ] && command -v em-config >/dev/null 2>&1; then
  _LLVM="$(em-config LLVM_ROOT 2>/dev/null || true)"
  [ -n "$_LLVM" ] && [ -x "$_LLVM/llvm-nm" ] && NM="$_LLVM/llvm-nm"
fi
if [ -n "$NM" ]; then
  _SYMS="$("$NM" "$KPLIB" 2>/dev/null || true)"
  # Do not use grep -q here: with pipefail, an early grep exit can SIGPIPE
  # printf and make a successful match look like a failed pipeline.
  if [ -n "$_SYMS" ] && ! printf '%s\n' "$_SYMS" | grep -w kpse_find_file >/dev/null; then
    echo "ERROR: kpse_find_file not defined in '$KPLIB' — -Wl,--wrap=kpse_find_file would no-op (interposition drift)" >&2; exit 1
  fi
fi
em++ -O2 -g0 \
  -sEMIT_EMSCRIPTEN_LICENSE=1 \
  luatex-entry.o kpse-hook.o \
  luatexdir/luahbtex-luatex.o mplibdir/luahbtex-lmplib.o \
  -Wl,--wrap=kpse_find_file \
  libluahbtexspecific.a libluatex.a libff.a libluamisc.a libluasocket.a libluaffi.a libluaharfbuzz.a \
  "$WB"/libs/lua53/.libs/libtexlua53.a libmplibcore.a \
  "$WB"/libs/zziplib/libzzip.a "$WB"/libs/libpng/libpng.a \
  "$WB"/libs/harfbuzz/libharfbuzz.a "$WB"/libs/graphite2/libgraphite2.a \
  "$XPDFLIB" "$WB"/libs/zlib/libz.a \
  lib/lib.a "$WB"/texk/kpathsea/.libs/libkpathsea.a libmputil.a libunilib.a libmd5.a \
  -Wl,-Map="$OUT/wasmtex-luatex.map" \
  -sALLOW_MEMORY_GROWTH=1 -sMODULARIZE=0 -sINVOKE_RUN=0 -sSTACK_SIZE=33554432 \
  -sEXPORTED_FUNCTIONS='["_compileLaTeX","_compileFormat","_main","_setMainEntry","_malloc","_free"]' \
  -sEXPORTED_RUNTIME_METHODS='["cwrap","FS","UTF8ToString","stringToUTF8","lengthBytesUTF8","intArrayFromString"]' \
  -sINITIAL_MEMORY=805306368 \
  --js-library "$GLUE/luatex-library.js" \
  -o "$OUT/wasmtex-luatex.js"
[ -s "$OUT/wasmtex-luatex.map" ] || { echo "LuaHBTeX link map was not generated"; exit 1; }
if grep -E 'libpplib|utilsha|sha(256|384|512)_digest|pp(doc|dict|array|stream|ref|xref)_' "$OUT/wasmtex-luatex.map"; then
  echo "ERROR: forbidden pplib archive or legacy pplib symbol remains in the LuaHBTeX link map" >&2
  exit 1
fi
grep -F 'libxpdf.a' "$OUT/wasmtex-luatex.map" >/dev/null || {
  echo "ERROR: LuaHBTeX link map does not contain the required Xpdf backend" >&2
  exit 1
}
grep -F 'wtpdf_' "$OUT/wasmtex-luatex.map" >/dev/null || {
  echo "ERROR: LuaHBTeX link map does not contain the required WTPDF adapter" >&2
  exit 1
}
if grep -aE 'pplib|utilsha|sha(256|384|512)_digest|pp(doc|dict|array|stream|ref|xref)_' \
    "$OUT/wasmtex-luatex.js" "$OUT/wasmtex-luatex.wasm"; then
  echo "ERROR: forbidden pplib or legacy pplib marker remains in the LuaHBTeX release bytes" >&2
  exit 1
fi
cp "$GLUE/luatex-worker.js" "$OUT/wasmtex-luatex.worker.js"

echo ""
echo "=== Output ==="
ls -lh "$OUT"/wasmtex-luatex.* || { echo "no output produced"; exit 1; }
