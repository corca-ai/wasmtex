#!/usr/bin/env bash
# build-makeindex.sh — Phase 2 (WASM) for makeindex from texlive-source.  (#101)
#
# makeindex (texk/makeindexk) is plain C — no web2c codegen, no native phase needed
# (unlike pdfTeX/LuaTeX). So this emconfigures the tree for makeindex only, lets the
# recursive make build texk/kpathsea + texk/makeindexk under emscripten (the vanilla
# final link may fail — we relink with our own glue), then emcc-links the makeindex
# objects with the entry shim + kpse hook + libkpathsea.
#
#   Output (/dist): wasmtex-makeindex.worker.js / .js / .wasm
#
# STATUS: scaffold — first build attempt; expect link-stage iteration (object glob,
# kpathsea discovery) like the XeTeX/dvipdfmx ports had.
set -uo pipefail

WB=/build/wasm-makeindex
SRC=/src/texlive-source
OUT=/dist
GLUE=/src                    # COPY'd entry + kpse-hook + worker + library live here
mkdir -p "$OUT"

DISABLES="--disable-pdftex --disable-bibtex --disable-xetex \
  --disable-luatex --disable-luahbtex --disable-luajittex --disable-luajithbtex --disable-mfluajit \
  --disable-mf --disable-mp --disable-ptex --disable-eptex --disable-uptex --disable-euptex"

echo "=== Phase A: emconfigure (makeindex only) ==="
rm -rf "$WB"; mkdir -p "$WB"; cd "$WB"
# NB: no --enable-web2c — makeindex only needs texk/kpathsea.
emconfigure "$SRC/configure" \
  --disable-all-pkgs --enable-makeindex $DISABLES \
  --without-x --disable-shared --disable-multiplatform --disable-native-texlive-build \
  >emconf.out 2>&1 || { echo "emconfigure failed"; tail -40 emconf.out; exit 1; }

echo "=== Phase B: trim tool-heavy libs, then recursive make (kpathsea + makeindexk) ==="
# makeindex needs only kpathsea. Drop the libs whose native codegen tools (gmp gen-fib,
# icupkg, …) can't run under emscripten — otherwise the recursive make dies on them
# BEFORE reaching texk/kpathsea, so libkpathsea.a is never built (same trim the dvipdfmx
# and luatex builds do). zlib/libpng are kept (bundled).
[ -f libs/Makefile ] && sed -i -E '/^(MAKE_SUBDIRS|CONF_SUBDIRS)/ s/\<(freetype2|icu|luajit|mpfr|mpfi|cairo|pixman|potrace|gmp)\>//g' libs/Makefile || true
# makeindex is plain C, so its objects build under emcc; only the final vanilla link
# (a native-style executable) may fail — that is expected, we compile sources in Phase C.
emmake make MAKEINFO=true CC_FOR_BUILD=gcc BUILD_CC=gcc -j"$(nproc)" >emmake.out 2>&1 \
  || echo "(recursive make returned nonzero — expected if the vanilla makeindex link fails)"
# Build kpathsea explicitly in case the recursive make stopped before it.
emmake make MAKEINFO=true CC_FOR_BUILD=gcc BUILD_CC=gcc -C texk/kpathsea -j"$(nproc)" >emmake-kpse.out 2>&1 \
  || echo "(kpathsea make nonzero)"

MD="$WB/texk/makeindexk"
[ -d "$MD" ] || { echo "makeindexk not configured/built"; tail -60 emmake.out; exit 1; }
echo "--- makeindexk objects ---"; find "$MD" -name '*.o' 2>/dev/null | head -40

echo "=== Phase C: final emcc link with own glue ==="
cd "$MD"
emcc -O2 -c "$GLUE/kpse-hook.c"        -o kpse-hook.o
emcc -O2 -c "$GLUE/makeindex-entry.c"  -o makeindex-entry.o
# makeindex is simple C: the recursive make's vanilla emcc link SUCCEEDS and folds the
# source objects into a.wasm (no loose .o to collect, unlike dvipdfmx/xetex). Compile the
# sources directly instead, against the configure-generated c-auto.h in $MD. mkind.c has
# main(); makeindex-entry.c calls it via extern (no duplicate main, same as bibtex-entry).
SRCDIR="$SRC/texk/makeindexk"
MISRC="$SRCDIR/genind.c $SRCDIR/mkind.c $SRCDIR/qsort.c $SRCDIR/scanid.c $SRCDIR/scanst.c $SRCDIR/sortid.c"
KPSE="$(find "$WB" -name 'libkpathsea.a' 2>/dev/null | head -1)"
if [ -z "$KPSE" ]; then
  echo "libkpathsea.a not found anywhere under $WB — kpathsea did not build in Phase B."
  echo "--- any kpathsea artifacts ---"; find "$WB" -name 'libkpathsea*' -o -name 'kpathsea' -type d 2>/dev/null | head
  echo "--- texk dir ---"; ls "$WB/texk" 2>/dev/null
  echo "--- emmake.out tail (kpathsea) ---"; grep -iE "kpathsea|libkpathsea" emmake.out | tail -15
  exit 1
fi
echo "libkpathsea.a: $KPSE"

# Interposition contract (#50, same as the engines): assert kpse_find_file is in
# libkpathsea so -Wl,--wrap=kpse_find_file engages. Skip if no wasm-capable nm.
NM=""
command -v llvm-nm >/dev/null 2>&1 && NM=llvm-nm
[ -z "$NM" ] && command -v emnm >/dev/null 2>&1 && NM=emnm
if [ -z "$NM" ] && command -v em-config >/dev/null 2>&1; then
  _LLVM="$(em-config LLVM_ROOT 2>/dev/null || true)"
  [ -n "$_LLVM" ] && [ -x "$_LLVM/llvm-nm" ] && NM="$_LLVM/llvm-nm"
fi
# Informational (NOT fail-loud, unlike the core engines #50): makeindex links against
# libkpathsea, so kpse_find_file is present; it's used only for the rare `-s style.ist`,
# so a no-op wrap degrades that one path, not the common `\printindex`. (A symbol-grep on
# the wasm archive proved unreliable across nm builds, so this is a best-effort note.)
if [ -n "$NM" ] && "$NM" "$KPSE" 2>/dev/null | grep -q 'kpse_find_file'; then
  echo "  kpse_find_file present in libkpathsea — --wrap should engage" >&2
fi

emcc -O2 -g0 \
  -sEMIT_EMSCRIPTEN_LICENSE=1 \
  -DUNIX -DKPATHSEA -DHAVE_CONFIG_H \
  -I"$MD" -I"$SRCDIR" \
  -I"$WB/texk/kpathsea" -I"$SRC/texk/kpathsea" -I"$SRC/texk" -I"$WB/texk" \
  kpse-hook.o makeindex-entry.o $MISRC \
  -Wl,--wrap=kpse_find_file \
  "$KPSE" \
  -sALLOW_MEMORY_GROWTH=1 -sFORCE_FILESYSTEM=1 -sEXIT_RUNTIME=0 -sINVOKE_RUN=0 -sMODULARIZE=0 \
  -sEXPORTED_FUNCTIONS='["_compileMakeindex","_setMainEntry","_main","_malloc","_free"]' \
  -sEXPORTED_RUNTIME_METHODS='["cwrap","FS","UTF8ToString","stringToUTF8","lengthBytesUTF8","intArrayFromString"]' \
  -sINITIAL_MEMORY=67108864 \
  --js-library "$GLUE/library.js" \
  -o "$OUT/wasmtex-makeindex.js" 2>emlink.out || { echo "final link failed"; tail -60 emlink.out; exit 1; }
cp "$GLUE/makeindex-worker.js" "$OUT/wasmtex-makeindex.worker.js"

echo "=== Output ==="
ls -lh "$OUT"/wasmtex-makeindex.* || { echo "no output"; exit 1; }
