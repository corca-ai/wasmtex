#!/usr/bin/env bash
# build-dvipdfm2.sh — Phase 2 (WASM) for dvipdfmx from texlive-source.  [#52 follow-up]
#
# Runs INSIDE the xetex-wasm image (which already has /src/texlive-source + the native
# build). Cross-compiles texk/dvipdfm-x with emscripten + this repo's own glue +
# real libkpathsea. dvipdfmx is plain C (no web2c
# codegen, no ICU, no fontconfig) so this is simpler than the XeTeX Phase 2.
#
#   Output (/dist): wasmtex-dvipdfm.worker.js / .js / .wasm
#
# STATUS: scaffold — first build attempt; expect link-stage iteration (object/lib
# discovery, libpaper, kpse font data) like the XeTeX port had.
set -euo pipefail

NB=/build/native
WB=/build/wasm-dpx
SRC=/src/texlive-source
OUT=/dist
GLUE=/src
mkdir -p "$OUT"

echo "=== ports: libpng/zlib (+ freetype, in case) via emscripten ==="
SYSROOT="$(em-config CACHE)/sysroot"
embuilder build zlib libpng freetype >/tmp/ports.out 2>&1 || { echo "ports failed"; tail -10 /tmp/ports.out; exit 1; }
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

echo "=== Phase A: emconfigure (dvipdfm-x) ==="
rm -rf "$WB"; mkdir -p "$WB"; cd "$WB"
# Mirror the xetex build: freetype via the emscripten port (--with-system + fake
# freetype-config), but keep libpng/zlib BUNDLED (texlive's libs) so configure finds
# them; the final link still uses the -sUSE_LIBPNG/-sUSE_ZLIB ports.
DISABLES="--disable-pdftex --disable-bibtex --disable-xetex \
  --disable-luatex --disable-luahbtex --disable-luajittex --disable-luajithbtex --disable-mfluajit \
  --disable-mf --disable-mp --disable-ptex --disable-eptex --disable-uptex --disable-euptex"
# NB: NO --enable-web2c — dvipdfmx only needs texk/kpathsea, and --enable-web2c drags
# in the whole web2c tree (mflua/otfcc/mp → potrace) which we don't build.
emconfigure "$SRC/configure" \
  --disable-all-pkgs --enable-dvipdfm-x $DISABLES \
  --with-system-freetype2 \
  --without-x --disable-shared --disable-multiplatform --disable-native-texlive-build \
  CPPFLAGS="-sUSE_FREETYPE=1 -sUSE_LIBPNG=1 -sUSE_ZLIB=1" \
  >emconf.out 2>&1 || { echo "emconfigure failed"; tail -40 emconf.out; exit 1; }

echo "=== Phase B: trim tool-heavy/unneeded libs (freetype2/icu -> ports; luajit etc.); keep libpng/zlib ==="
sed -i -E '/^(MAKE_SUBDIRS|CONF_SUBDIRS)/ s/\<(freetype2|icu|luajit|mpfr|mpfi|cairo|pixman|potrace|gmp)\>//g' libs/Makefile || true

echo "=== Phase C: build libs (kpathsea + bundled libpng/zlib) ==="
emmake make MAKEINFO=true CC_FOR_BUILD=gcc BUILD_CC=gcc -C libs -j"$(nproc)" >emmake-libs.out 2>&1 || { echo "libs build failed"; tail -40 emmake-libs.out; exit 1; }

echo "=== Phase D: top-level make (configures+builds texk/kpathsea + texk/dvipdfm-x; vanilla dvipdfmx link may fail under emcc — ok) ==="
# The texk/* subdirs are configured by the recursive top-level make, not by configure.
# dvipdfmx is plain C (no web2c codegen), so its objects build under emcc; only the
# final vanilla link fails (we relink with our own glue below).
emmake make MAKEINFO=true CC_FOR_BUILD=gcc BUILD_CC=gcc -j"$(nproc)" >emmake-top.out 2>&1 || echo "(top make returned nonzero — expected if the vanilla dvipdfmx link fails)"
DD="$WB/texk/dvipdfm-x"
[ -d "$DD" ] || { echo "dvipdfm-x not configured/built"; tail -50 emmake-top.out; exit 1; }
echo "--- dpx objects/libs ---"; find "$DD" -name '*.o' -o -name '*.a' 2>/dev/null | head -40

echo "=== Phase E: final emcc link with own glue ==="
cd "$DD"
emcc -O2 -c "$GLUE/kpse-hook.c" -o kpse-hook.o
emcc -O2 -c "$GLUE/dvipdfm-entry.c" -o dvipdfm-entry.o
emcc -O2 -c "$GLUE/dvipdfm-stubs.c" -o dvipdfm-stubs.o  # libpaper + getpass stubs
# The texlive program is `xdvipdfmx`, built from many unprefixed objects (agl.o,
# cff.o, error.o, mem.o, dvipdfmx.o[main], ...) — no convenience lib. Link them all
# except callexe.o (the call_xdvipdfmx launcher = a second main) + our own objects.
DPXOBJS=$(ls *.o 2>/dev/null | grep -vE '^(callexe|kpse-hook|dvipdfm-entry|dvipdfm-stubs)\.o$' | tr '\n' ' ')
[ -n "$DPXOBJS" ] || { echo "no dvipdfmx objects in $DD"; ls; exit 1; }
echo "dpx objects: $DPXOBJS"
KPSE="$(find "$WB/texk/kpathsea" -name libkpathsea.a | head -1)"
# Interposition contract (#50): kpse_find_file must be defined in libkpathsea, else
# -Wl,--wrap=kpse_find_file below silently no-ops and the CDN file-lookup hook never
# fires. Fail loud on upstream drift. (docs/texlive-upgrade.md interpose-don't-patch)
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
  _SYMS="$("$NM" "$KPSE" 2>/dev/null || true)"
  # Do not use grep -q here: with pipefail, an early grep exit can SIGPIPE
  # printf and make a successful match look like a failed pipeline.
  if [ -n "$_SYMS" ] && ! printf '%s\n' "$_SYMS" | grep -w kpse_find_file >/dev/null; then
    echo "ERROR: kpse_find_file not defined in '$KPSE' — -Wl,--wrap=kpse_find_file would no-op (interposition drift)" >&2; exit 1
  fi
fi
emcc -O2 -g0 \
  -sEMIT_EMSCRIPTEN_LICENSE=1 \
  kpse-hook.o dvipdfm-entry.o dvipdfm-stubs.o $DPXOBJS \
  -Wl,--wrap=kpse_find_file \
  "$KPSE" \
  -sUSE_FREETYPE=1 -sUSE_LIBPNG=1 -sUSE_ZLIB=1 \
  -sALLOW_MEMORY_GROWTH=1 -sMODULARIZE=0 -sINVOKE_RUN=0 -sSTACK_SIZE=33554432 \
  -sEXPORTED_FUNCTIONS='["_compilePDF","_setMainEntry","_main","_malloc","_free"]' \
  -sEXPORTED_RUNTIME_METHODS='["cwrap","FS","UTF8ToString","stringToUTF8","lengthBytesUTF8","intArrayFromString"]' \
  -sINITIAL_MEMORY=268435456 \
  --js-library "$GLUE/xetex-dvipdfm-library.js" \
  -o "$OUT/wasmtex-dvipdfm.js" 2>emlink.out || { echo "final link failed"; tail -60 emlink.out; exit 1; }
cp "$GLUE/dvipdfm-worker.js" "$OUT/wasmtex-dvipdfm.worker.js"

echo "=== Output ==="
ls -lh "$OUT"/wasmtex-dvipdfm.* || { echo "no output"; exit 1; }
