#!/usr/bin/env bash
set -euo pipefail
# Exercise the real wrapper and the pinned TeX Live zlib, not a JS stand-in.
glue_dir=$(cd "$(dirname "$0")/.." && pwd)
probe_dir=$(mktemp -d)
trap 'rm -rf "$probe_dir"' EXIT
for side in baseline candidate; do
  extra=()
  if [ "$side" = candidate ]; then
    extra=("$glue_dir/fmt-cache.c" -Wl,--wrap=gzdopen,--wrap=gzread,--wrap=gzclose)
  fi
  emcc -O2 -I/build/wasm/libs/zlib/include \
    "$glue_dir/tests/fmt-cache-probe.c" "${extra[@]}" /build/wasm/libs/zlib/libz.a \
    -sMODULARIZE=1 -sENVIRONMENT=node -sALLOW_MEMORY_GROWTH=1 \
    -sEXPORTED_FUNCTIONS='["_probe_open","_probe_read","_probe_close","_malloc","_free"]' \
    -sEXPORTED_RUNTIME_METHODS='["FS","ccall"]' \
    -o "$probe_dir/fmt-probe-$side.cjs"
done
node "$glue_dir/tests/fmt-cache-probe.cjs" "$probe_dir"
