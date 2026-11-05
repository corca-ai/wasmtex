#!/usr/bin/env bash
# build-metafont.sh — Metafont and GFtoPK from texlive-source to WebAssembly.
#
# A native build tangles the WEB sources into C; emconfigure then produces the headers
# and libkpathsea for wasm32, and emcc links that C with our file lookup hook.
#
#   Output (/dist): wasmtex-metafont.js — both modules, wasm embedded, then the bridge
set -uo pipefail

NATIVE=/build/native
WB=/build/wasm-metafont
SRC=/src/texlive-source
OUT=/dist
GLUE=/src
mkdir -p "$OUT"

CONFIGURE_FLAGS="--disable-all-pkgs --enable-web2c --enable-mf --enable-web-progs \
  --without-x --without-mf-x-toolkit --disable-shared --disable-multiplatform \
  --disable-native-texlive-build --disable-largefile --disable-synctex \
  --disable-tex --disable-etex --disable-pdftex --disable-xetex --disable-luatex \
  --disable-luahbtex --disable-luajittex --disable-luajithbtex --disable-mflua \
  --disable-mfluajit --disable-mp --disable-pmp --disable-upmp --disable-ptex \
  --disable-eptex --disable-uptex --disable-euptex --disable-aleph --disable-hitex"

echo "=== Phase A: native tangle of Metafont and GFtoPK ==="
cd "$NATIVE"
"$SRC/configure" $CONFIGURE_FLAGS >configure.out 2>&1 || { tail -40 configure.out; exit 1; }
make MAKEINFO=true -k -j"$(nproc)" >make.out 2>&1 || echo "(native make nonzero: only the generated C below matters)"
NW="$NATIVE/texk/web2c"
for generated in mfini.c mf0.c mf-pool.c mfd.h mfcoerce.h gftopk.c gftopk.h; do
  [ -s "$NW/$generated" ] || { echo "native build did not generate $generated"; tail -40 make.out; exit 1; }
done

echo "=== Phase B: emconfigure, kpathsea and the web2c library ==="
rm -rf "$WB"; mkdir -p "$WB"; cd "$WB"
emconfigure "$SRC/configure" $CONFIGURE_FLAGS >emconf.out 2>&1 || { tail -40 emconf.out; exit 1; }
[ -f libs/Makefile ] && sed -i -E '/^(MAKE_SUBDIRS|CONF_SUBDIRS)/ s/\<(freetype2|icu|luajit|mpfr|mpfi|cairo|pixman|potrace|gmp)\>//g' libs/Makefile || true
emmake make MAKEINFO=true CC_FOR_BUILD=gcc BUILD_CC=gcc -k -j"$(nproc)" >emmake.out 2>&1 \
  || echo "(recursive make nonzero: web2c's tools cannot run as wasm, the objects are compiled below)"
emmake make MAKEINFO=true CC_FOR_BUILD=gcc BUILD_CC=gcc -C texk/kpathsea -j"$(nproc)" >emmake-kpse.out 2>&1 \
  || echo "(kpathsea make nonzero)"
WW="$WB/texk/web2c"
[ -f "$WW/c-auto.h" ] || { echo "web2c was not configured"; tail -40 emmake.out; exit 1; }
emmake make MAKEINFO=true -C "$WW/lib" -j"$(nproc)" >emmake-lib.out 2>&1 || echo "(web2c lib make nonzero)"
KPSE="$(find "$WB" -name 'libkpathsea.a' 2>/dev/null | head -1)"
LIBW2C="$WW/lib/lib.a"
[ -n "$KPSE" ] && [ -f "$LIBW2C" ] || { echo "kpathsea or the web2c library is missing"; tail -40 emmake-lib.out; exit 1; }

echo "=== Phase C: compile and link ==="
cd "$WW"
for generated in mfini.c mf0.c mf-pool.c mfd.h mfcoerce.h gftopk.c gftopk.h; do
  cp "$NW/$generated" .
done
CFLAGS="-O2 -DHAVE_CONFIG_H -DMFNOWIN -I. -I$SRC/texk/web2c -I./w2c -I$WB/texk -I$SRC/texk"
for unit in mfini mf0 mf-pool gftopk; do
  emcc $CFLAGS -c "$unit.c" -o "$unit.o" || exit 1
done
emcc $CFLAGS -c "$SRC/texk/web2c/mfextra.c" -o mfextra.o 2>/dev/null \
  || emcc $CFLAGS -c mfextra.c -o mfextra.o || exit 1
emcc -O2 -c "$GLUE/metafont-screen.c" -o metafont-screen.o || exit 1
emcc -O2 -c "$GLUE/kpse-hook.c" -o kpse-hook.o || exit 1

LINK_FLAGS=(
  -O2 -g0 -sEMIT_EMSCRIPTEN_LICENSE=1
  -sALLOW_MEMORY_GROWTH=1 -sFORCE_FILESYSTEM=1 -sEXIT_RUNTIME=1 -sINVOKE_RUN=0
  -sMODULARIZE=1 -sSINGLE_FILE=1 -sWASM_ASYNC_COMPILATION=0 -sENVIRONMENT=worker,node
  '-sEXPORTED_RUNTIME_METHODS=["FS","callMain","ENV"]'
  --js-library "$GLUE/metafont-library.js"
  -Wl,--wrap=kpse_find_file
)
emcc "${LINK_FLAGS[@]}" -sEXPORT_NAME=createWasmtexMetafont \
  mfextra.o mfini.o mf0.o mf-pool.o metafont-screen.o kpse-hook.o \
  -Wl,-Map="$OUT/wasmtex-metafont.map" \
  "$LIBW2C" "$KPSE" -o metafont-module.js 2>emlink-mf.out \
  || { echo "Metafont link failed"; tail -40 emlink-mf.out; exit 1; }
emcc "${LINK_FLAGS[@]}" -sEXPORT_NAME=createWasmtexGftopk \
  gftopk.o kpse-hook.o \
  -Wl,-Map="$OUT/wasmtex-gftopk.map" \
  "$LIBW2C" "$KPSE" -o gftopk-module.js 2>emlink-gf.out \
  || { echo "GFtoPK link failed"; tail -40 emlink-gf.out; exit 1; }
for map in wasmtex-metafont.map wasmtex-gftopk.map; do
  [ -s "$OUT/$map" ] || { echo "$map was not generated"; exit 1; }
  if grep -E 'libpplib|pp(doc|dict|array|stream|ref|xref)_' "$OUT/$map"; then
    echo "ERROR: forbidden pplib archive or symbol remains in $map" >&2
    exit 1
  fi
done

# Modularized output assigns `var` in its own scope for `export`; an imported worker
# script reads the factories off self, so publish them there.
{
  cat metafont-module.js
  echo ';self.createWasmtexMetafont = createWasmtexMetafont;'
  cat gftopk-module.js
  echo ';self.createWasmtexGftopk = createWasmtexGftopk;'
  cat "$GLUE/metafont-bridge.js"
} > "$OUT/wasmtex-metafont.js"

echo "=== Output ==="
ls -lh "$OUT"/wasmtex-metafont.* "$OUT"/wasmtex-gftopk.* || { echo "no output"; exit 1; }
