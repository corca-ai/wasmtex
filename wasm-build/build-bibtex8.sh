#!/usr/bin/env bash
# build-bibtex8.sh — Phase 2 (WASM) for bibtex8 from texlive-source.  (#102)
#
# bibtex8 (texk/bibtex-x, compiled with -DSUPPORT_8BIT) is plain C — no web2c codegen,
# no native phase. We enable only bibtex8 (NOT bibtexu, which would pull in ICU), let
# the recursive make build texk/kpathsea + texk/bibtex-x under emscripten, then
# emcc-relink the bibtex8 objects with our own glue.
#
#   Output (/dist): wasmtex-bibtex8.worker.js / .js / .wasm
#
# STATUS: scaffold — first build attempt; expect link-stage iteration (object glob,
# kpathsea discovery) like the makeindex/dvipdfmx ports.
set -uo pipefail

WB=/build/wasm-bibtex8
SRC=/src/texlive-source
OUT=/dist
GLUE=/src
mkdir -p "$OUT"

DISABLES="--disable-pdftex --disable-xetex \
  --disable-luatex --disable-luahbtex --disable-luajittex --disable-luajithbtex --disable-mfluajit \
  --disable-mf --disable-mp --disable-ptex --disable-eptex --disable-uptex --disable-euptex"

echo "=== Phase A: emconfigure (bibtex8 only; bibtexu disabled to avoid ICU) ==="
rm -rf "$WB"; mkdir -p "$WB"; cd "$WB"
emconfigure "$SRC/configure" \
  --disable-all-pkgs --enable-bibtex-x --enable-bibtex8 --disable-bibtexu $DISABLES \
  --without-x --disable-shared --disable-multiplatform --disable-native-texlive-build \
  >emconf.out 2>&1 || { echo "emconfigure failed"; tail -40 emconf.out; exit 1; }

echo "=== Phase B: recursive make (configures+builds texk/kpathsea + texk/bibtex-x) ==="
emmake make MAKEINFO=true CC_FOR_BUILD=gcc BUILD_CC=gcc -j"$(nproc)" >emmake.out 2>&1 \
  || echo "(recursive make returned nonzero — expected if the vanilla bibtex8 link fails)"

BD="$WB/texk/bibtex-x"
[ -d "$BD" ] || { echo "bibtex-x not configured/built"; tail -60 emmake.out; exit 1; }
echo "--- bibtex-x objects ---"; find "$BD" -name '*.o' 2>/dev/null | head -40

echo "=== Phase C: final emcc link with own glue ==="
cd "$BD"
emcc -O2 -c "$GLUE/kpse-hook.c"      -o kpse-hook.o
emcc -O2 -c "$GLUE/bibtex8-entry.c"  -o bibtex8-entry.o
# bibtex8 objects (automake per-target prefix bibtex8-*.o since bibtex8_CPPFLAGS sets
# -DSUPPORT_8BIT), minus our own glue objects.
B8OBJS=$(ls bibtex8-*.o 2>/dev/null | grep -vE '^bibtex8-entry\.o$' | tr '\n' ' ')
[ -n "$B8OBJS" ] || { echo "no bibtex8 objects in $BD"; ls; exit 1; }
echo "bibtex8 objects: $B8OBJS"
KPSE="$(find "$WB/texk/kpathsea" -name libkpathsea.a | head -1)"
[ -n "$KPSE" ] || { echo "libkpathsea.a not found"; exit 1; }

# Interposition contract (#50): assert kpse_find_file is in libkpathsea (skip if no
# wasm-capable nm — system nm can't read emscripten archives).
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
  kpse-hook.o bibtex8-entry.o $B8OBJS \
  -Wl,--wrap=kpse_find_file \
  -Wl,-Map="$OUT/wasmtex-bibtex8.map" \
  "$KPSE" \
  -sALLOW_MEMORY_GROWTH=1 -sFORCE_FILESYSTEM=1 -sEXIT_RUNTIME=0 -sINVOKE_RUN=0 -sMODULARIZE=0 \
  -sEXPORTED_FUNCTIONS='["_compileBibtex8","_setMainEntry","_main","_malloc","_free"]' \
  -sEXPORTED_RUNTIME_METHODS='["cwrap","FS","UTF8ToString","stringToUTF8","lengthBytesUTF8","intArrayFromString"]' \
  -sINITIAL_MEMORY=134217728 \
  --js-library "$GLUE/library.js" \
  -o "$OUT/wasmtex-bibtex8.js" 2>emlink.out || { echo "final link failed"; tail -60 emlink.out; exit 1; }
[ -s "$OUT/wasmtex-bibtex8.map" ] || { echo "BibTeX8 link map was not generated"; exit 1; }
if grep -E 'libpplib|pp(doc|dict|array|stream|ref|xref)_' "$OUT/wasmtex-bibtex8.map"; then
  echo "ERROR: forbidden pplib archive or symbol remains in the BibTeX8 link map" >&2
  exit 1
fi
cp "$GLUE/bibtex8-worker.js" "$OUT/wasmtex-bibtex8.worker.js"

echo "=== Output ==="
ls -lh "$OUT"/wasmtex-bibtex8.* || { echo "no output"; exit 1; }
