#!/usr/bin/env bash
# =============================================================================
# build-xetex2.sh — Phase 2 (WASM) for XeTeX from texlive-source. Docker ENTRYPOINT.  [#52]
# =============================================================================
#
# Phase 1 (native C generation + codegen tools + native libkpathsea) is baked into
# the image by Dockerfile.xetex at /build/native. This cross-compiles the XeTeX
# source graph with Emscripten and links it with this repo's OWN glue + the
# fontconfig shim (xetexfontlist.txt-backed) + real libkpathsea.
#
# Font/Unicode libs use Emscripten ports for
# icu/freetype/libpng/zlib (-sUSE_*), and build texlive's bundled harfbuzz/graphite2/
# teckit. The fontconfig shim is installed into the emcc sysroot as libfontconfig so
# configure's hard fontconfig requirement is satisfied and the build links our shim.
#
# Output (/dist): wasmtex-xetex.worker.js / .js / .wasm
# =============================================================================
set -uo pipefail

NB=/build/native
WB=/build/wasm
SRC=/src/texlive-source
OUT=/dist
GLUE=/src

DISABLES="--disable-pdftex --disable-bibtex \
  --disable-luatex --disable-luahbtex --disable-luajittex --disable-luajithbtex --disable-mfluajit \
  --disable-mf --disable-mp \
  --disable-ptex --disable-eptex --disable-uptex --disable-euptex"

mkdir -p "$OUT"

echo "=== Phase 2.0: install fontconfig shim into the emcc sysroot ==="
# XeTeX's configure hard-requires fontconfig; the emcc sysroot has none. Provide our
# shim as the system fontconfig (header + a real lib with FcInit etc.) so configure's
# link check passes AND the build links our shim. Emscripten ports supply the rest.
SYSROOT="$(em-config CACHE)/sysroot"
mkdir -p "$SYSROOT/include/fontconfig" "$SYSROOT/lib"
cp "$GLUE/fontconfig-shim.h" "$SYSROOT/include/fontconfig/fontconfig.h"
emcc -O2 -sUSE_FREETYPE=1 -c "$GLUE/fontconfig-shim.c" -o /tmp/fontconfig-shim.o \
  >/tmp/fcshim.out 2>&1 || { echo "shim compile failed"; cat /tmp/fcshim.out; exit 1; }
emar rcs "$SYSROOT/lib/libfontconfig.a" /tmp/fontconfig-shim.o
echo "shim installed: $SYSROOT/lib/libfontconfig.a"

echo "=== Phase 2.0b: provide ICU via the emscripten port + a fake icu-config ==="
# XeTeX requires ICU; building texlive's bundled ICU under emcc is intractable (its
# build tools icupkg/pkgdata/genrb can't run as wasm). Use the emscripten ICU port:
# build it (headers → sysroot), and provide a fake `icu-config` so --with-system-icu's
# detection (which wants icu-config or pkg-config) finds it. ICU is linked via
# -sUSE_ICU at the final link (the port supplies libs there). icu 68.2 == what
# the wasm32 engine uses, so XeTeX compiles against it.
embuilder build icu >/tmp/icu-port.out 2>&1 || { echo "icu port build failed"; tail -10 /tmp/icu-port.out; exit 1; }
cat >/usr/local/bin/icu-config <<EOF
#!/bin/sh
cpp=""; ld=""
for a in "\$@"; do
  case "\$a" in
    --version) echo "68.2"; exit 0 ;;
    --prefix) echo "$SYSROOT"; exit 0 ;;
    --cppflags*) cpp="-I$SYSROOT/include" ;;
    --ldflags*) ld="-sUSE_ICU=1" ;;
  esac
done
echo "\$cpp \$ld"
EOF
chmod +x /usr/local/bin/icu-config
echo "fake icu-config installed (icu 68.2 via emscripten port)"

echo "=== Phase 2.0c: provide FreeType via the emscripten port + a fake freetype-config ==="
# Same idea as ICU: XeTeX's build recurses into libs/freetype2; building it under emcc
# fails (apinames can't run). Use the freetype port + --with-system-freetype2.
embuilder build freetype >/tmp/ft-port.out 2>&1 || { echo "freetype port build failed"; tail -10 /tmp/ft-port.out; exit 1; }
cat >/usr/local/bin/freetype-config <<EOF
#!/bin/sh
for a in "\$@"; do case "\$a" in
  --ftversion|--version) echo "2.6.0"; exit 0 ;;
  --cflags) echo "-I$SYSROOT/include/freetype2"; exit 0 ;;
  --libs) echo "-sUSE_FREETYPE=1"; exit 0 ;;
  --prefix|--exec-prefix) echo "$SYSROOT"; exit 0 ;;
esac; done
EOF
chmod +x /usr/local/bin/freetype-config
echo "fake freetype-config installed (freetype 2.6 via emscripten port)"

echo "=== Phase 2a: emconfigure (xetex) ==="
rm -rf "$WB"; mkdir -p "$WB"; cd "$WB" || exit 1
# DISABLES is an intentional list of configure arguments.
# shellcheck disable=SC2086
emconfigure "$SRC/configure" \
  --disable-all-pkgs --enable-web2c --enable-xetex --with-system-icu --with-system-freetype2 $DISABLES \
  --without-x --disable-shared --disable-multiplatform --disable-native-texlive-build \
  CPPFLAGS="-I$GLUE/pdf-backend -sUSE_FREETYPE=1 -sUSE_ICU=1 -sUSE_LIBPNG=1 -sUSE_ZLIB=1" \
  >emconf.out 2>&1 || { echo "emconfigure failed"; tail -40 emconf.out; exit 1; }

echo "=== Phase 2b: trim only the tool-heavy libs (freetype2/icu → emscripten ports) ==="
# freetype2 (apinames) and icu (icupkg/pkgdata/genrb/…) compile build-time TOOLS that
# can't run as wasm → take those from emscripten ports. Keep zlib/libpng/harfbuzz/
# graphite2/teckit bundled (plain C, no native build tools, and harfbuzz/teckit need
# bundled zlib at configure). Also drop the MetaPost math libs.
sed -i -E '/^(MAKE_SUBDIRS|CONF_SUBDIRS)/ s/\<(mpfr|mpfi|cairo|pixman|potrace|gmp|freetype2|icu)\>//g' libs/Makefile

echo "=== Phase 2c: build the needed libs (Xpdf/harfbuzz/graphite2/teckit) ==="
emmake make MAKEINFO=true CC_FOR_BUILD=gcc BUILD_CC=gcc -C libs -j"$(nproc)" \
  >emmake-libs.out 2>&1 || { echo "libs build failed"; tail -40 emmake-libs.out; exit 1; }
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
  echo "Xpdf library missing after the XeTeX dependency build"
  find "$WB/libs/xpdf" -maxdepth 3 -type f 2>/dev/null | tail -40
  exit 1
}
echo "Xpdf library: $XPDFLIB"

echo "=== Phase 2c.1: WTPDF WebAssembly smoke test ==="
EXPECTED_XPDF_VERSION=4.04
if [ "${TEXLIVE_YEAR:-2025}" = 2026 ]; then EXPECTED_XPDF_VERSION=4.06; fi
ACTUAL_XPDF_VERSION=$(sed -n 's/^#define xpdfVersion[[:space:]]*"\([^"]*\)"/\1/p' \
  "$SRC/libs/xpdf/xpdf-src/xpdf/config.h")
[ "$ACTUAL_XPDF_VERSION" = "$EXPECTED_XPDF_VERSION" ] || {
  echo "unexpected TeX Live $TEXLIVE_YEAR Xpdf version: $ACTUAL_XPDF_VERSION" >&2
  exit 1
}
XPDF_INCLUDES=(
  -I"$GLUE/pdf-backend"
  -I"$SRC/libs/xpdf"
  -I"$SRC/libs/xpdf/xpdf-src/goo"
  -I"$SRC/libs/xpdf/xpdf-src/fofi"
  -I"$SRC/libs/xpdf/xpdf-src/xpdf"
  -I"$WB/libs/xpdf"
)
em++ -O2 -std=c++11 -DPDF_PARSER_ONLY \
  -DWTPDF_EXPECTED_BACKEND_VERSION=\"$EXPECTED_XPDF_VERSION\" \
  "${XPDF_INCLUDES[@]}" \
  "$GLUE/pdf-backend/wtpdf-xpdf.cc" \
  "$GLUE/pdf-backend/wtpdf-smoke.cc" \
  "$XPDFLIB" -sUSE_LIBPNG=1 -sUSE_ZLIB=1 \
  -sEXIT_RUNTIME=1 -o /tmp/wtpdf-smoke.js || {
    echo "WTPDF WebAssembly smoke-test build failed"
    exit 1
  }
node /tmp/wtpdf-smoke.js || {
  echo "WTPDF WebAssembly smoke test failed"
  exit 1
}

echo "=== Phase 2d: top-level make (codegen step fails as wasm — ok) ==="
emmake make MAKEINFO=true CC_FOR_BUILD=gcc BUILD_CC=gcc -j"$(nproc)" >emmake-top.out 2>&1 || true
WW="$WB/texk/web2c"
NW="$NB/texk/web2c"
[ -d "$WW" ] || { echo "web2c not configured"; tail -40 emmake-top.out; exit 1; }

echo "=== Phase 2e: point codegen at NATIVE tools, build xetex objects ==="
# xetex's web2c/convert execs ./web2c/{web2c,fixwrites,splitup} by HARDCODED relative
# path (ignoring make vars), and make rebuilds those as wasm — so rewrite convert to
# call the Phase-1 native binaries. (luatex's codegen path didn't hit fixwrites/splitup.)
CONVERT="$SRC/texk/web2c/web2c/convert"
[ -f "$CONVERT" ] && sed -i \
  -e "s#\./web2c/web2c#$NW/web2c/web2c#g" \
  -e "s#\./web2c/fixwrites#$NW/web2c/fixwrites#g" \
  -e "s#\./web2c/splitup#$NW/web2c/splitup#g" "$CONVERT"
for s in "$WW"/ctangleboot-sh "$WW"/tangle-sh "$WW"/web2c-sh; do
  [ -f "$s" ] && sed -i \
    -e "s#\./ctangleboot#$NW/ctangleboot#g" \
    -e "s#\./tangleboot#$NW/tangleboot#g" \
    -e "s#\./otangle#$NW/otangle#g" \
    -e "s#\./ctangle#$NW/ctangle#g" \
    -e "s#\./tangle#$NW/tangle#g" \
    -e "s#\./web2c/web2c#$NW/web2c/web2c#g" "$s"
done
# The web2c codegen tools are taken from the Phase-1 NATIVE build via make vars
# (TIE/CTANGLE/TANGLE/WEB2C — texk/web2c/Makefile.am invokes them as $(TIE) etc.),
# since the wasm-compiled tools can't execute. (convert's hardcoded ./web2c/* are
# rewritten above.)
emmake make MAKEINFO=true CC_FOR_BUILD=gcc BUILD_CC=gcc \
  TIE="$NW/tie" \
  CTANGLE="$NW/ctangle" CTANGLEBOOT="$NW/ctangleboot" \
  TANGLE="$NW/tangle" TANGLEBOOT="$NW/tangleboot" \
  OTANGLE="$NW/otangle" \
  WEB2C="$NW/web2c/web2c" \
  makecpool="$NW/web2c/makecpool" \
  -C texk/web2c xetex >emmake-xetex.out 2>&1 || true  # vanilla final link fails under emcc — relink next
[ -f "$WW/libxetex.a" ] || { echo "xetex objects missing"; tail -60 emmake-xetex.out; exit 1; }
echo "xetex objects built."
echo "=== emmake-xetex.out tail (texlive's authoritative link cmd + objects) ==="
tail -25 "$WB/emmake-xetex.out" 2>/dev/null
echo "--- synctex/pool objects anywhere ---"
find "$WB/texk/web2c" -name '*synctex*.o' -o -name '*pool*.o' 2>/dev/null | head

echo "=== Phase 2f: compile WTPDF and link XeTeX with Xpdf ==="
cd "$WW" || exit 1
# The xetex PROGRAM objects are xetex-*.o: xetex0/xetexini in $WW and xetexextra
# (main + C globals) under xetexdir/. Capture them BEFORE compiling our own
# xetex-entry.o (which would also match the glob). These are NOT in libxetex.a
# (those are libxetex_a-*.o), so no duplication.
# The filenames come from fixed TeX Live build directories and contain no spaces.
# shellcheck disable=SC2012
XEOBJS=$(ls xetex-*.o xetexdir/xetex-*.o synctexdir/xetex-*.o 2>/dev/null | tr '\n' ' ')
echo "program objects: $XEOBJS"
[ -n "$XEOBJS" ] || { echo "no xetex program objects found"; exit 1; }
emcc -O2 -c "$GLUE/kpse-hook.c" -o kpse-hook.o
emcc -O2 -c "$GLUE/xetex-entry.c" -o xetex-entry.o
emcc -O2 -sUSE_FREETYPE=1 -c "$GLUE/fontconfig-shim.c" -o fontconfig-shim.o
# ICU data (#52 M4b): emscripten's -sUSE_ICU links libicu_stubdata (ICU with NO
# converter data), so XeTeXFontMgr_FC::initialize()'s ucnv_open("macintosh") fails
# -> "cannot read font names". Instead of baking ~28MB into the wasm, the worker
# glue fetches icudt68l.dat (an engine asset) at init and registers it via
# set_icu_common_data (udata_setCommonData). -sUSE_ICU supplies the headers.
emcc -O2 -sUSE_ICU=1 -c "$GLUE/icu-data-loader.c" -o icu-data-loader.o
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
# XEOBJS must expand to separate linker arguments.
# shellcheck disable=SC2086
em++ -O2 -g0 \
  -sEMIT_EMSCRIPTEN_LICENSE=1 \
  kpse-hook.o xetex-entry.o fontconfig-shim.o icu-data-loader.o \
  $XEOBJS \
  -Wl,--wrap=kpse_find_file -Wl,--wrap=FT_New_Face \
  -Wl,-Map="$OUT/wasmtex-xetex.map" \
  libxetex.a \
  "$(find "$WB/libs/harfbuzz" -name libharfbuzz.a | head -1)" \
  "$(find "$WB/libs/graphite2" -name libgraphite2.a | head -1)" \
  "$(find "$WB/libs/teckit" -name 'libTECkit.a' | head -1)" \
  "$(find "$WB/libs/teckit" -name 'libTECkit_Compiler.a' | head -1)" \
  "$XPDFLIB" \
  lib/lib.a "$(find "$WB/texk/kpathsea" -name libkpathsea.a | head -1)" libmd5.a \
  -sUSE_FREETYPE=1 -sUSE_ICU=1 -sUSE_LIBPNG=1 -sUSE_ZLIB=1 \
  -sALLOW_MEMORY_GROWTH=1 -sMODULARIZE=0 -sINVOKE_RUN=0 -sSTACK_SIZE=33554432 \
  -sEXPORTED_FUNCTIONS='["_compileLaTeX","_compileFormat","_compileBibtex","_main","_setMainEntry","_set_icu_common_data","_malloc","_free"]' \
  -sEXPORTED_RUNTIME_METHODS='["cwrap","FS","UTF8ToString","stringToUTF8","lengthBytesUTF8","intArrayFromString"]' \
  -sINITIAL_MEMORY=805306368 \
  --js-library "$GLUE/xetex-library.js" \
  -o "$OUT/wasmtex-xetex.js" 2>emlink.out || { echo "final link failed"; tail -60 emlink.out; exit 1; }

[ -s "$OUT/wasmtex-xetex.map" ] || { echo "XeTeX link map was not generated"; exit 1; }
if grep -E 'libpplib|pp(doc|dict|array|stream|ref)_' "$OUT/wasmtex-xetex.map"; then
  echo "ERROR: forbidden pplib archive or symbol remains in the XeTeX link map" >&2
  exit 1
fi
grep -F 'libxpdf.a' "$OUT/wasmtex-xetex.map" >/dev/null || {
  echo "ERROR: XeTeX link map does not contain the required Xpdf backend" >&2
  exit 1
}
cp "$GLUE/xetex-worker.js" "$OUT/wasmtex-xetex.worker.js"

echo ""
echo "=== Output ==="
ls -lh "$OUT"/wasmtex-xetex.* || { echo "no output produced"; exit 1; }
