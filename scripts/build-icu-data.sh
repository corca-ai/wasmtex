#!/usr/bin/env bash
# Produce + (optionally) upload the ICU common-data file the from-source XeTeX engine
# fetches at runtime.  [#52 M4b]
#
# Why: emscripten's -sUSE_ICU links libicu_stubdata (ICU with NO converter data), so
# the unpatched upstream XeTeX font manager (ucnv_open("macintosh")) fails. Rather
# than bake ~28MB into the wasm, the engine fetches `icudt68l.dat` from the CDN at
# init (see wasm-build/icu-data-loader.c + xetex-worker.js) and registers it
# via udata_setCommonData.
#
# This is an IMMUTABLE asset (tied to ICU 68.2 == the version emscripten's port uses),
# so it's a ONE-TIME upload — NOT part of every engine CI build. Re-run only when the
# ICU version changes.
#
# Usage:
#   scripts/build-icu-data.sh                 # build icudt68l.dat into /tmp/icu-data/
#   scripts/build-icu-data.sh --upload        # build + gzip + upload to the selected provider
#
# Object target: <bucket>/<immutable-prefix>/<year>/icudt68l.dat (gzip Content-Encoding,
# so the worker's XHR transparently decompresses). The worker fetches it at
# ${texlive_endpoint}icudt68l.dat.
# Uses TEXLIVE_OBJECT_PROVIDER (r2 by default), TEXLIVE_OBJECT_BUCKET,
# TEXLIVE_OBJECT_PREFIX and TEXLIVE_OBJECT_PROFILE. R2 requires
# TEXLIVE_OBJECT_ENDPOINT; S3 requires TEXLIVE_OBJECT_REGION and an explicit
# bucket, with no endpoint override. TEXLIVE_R2_PROFILE remains the R2 fallback.
set -euo pipefail

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)

ICU_VER="68_2"          # must match emscripten's ICU port (tools/ports/icu.py TAG)
ICU_MAJOR="68"
YEAR="${TEXLIVE_YEAR:-${YEAR:-2025}}"
OBJECT_BUCKET="${TEXLIVE_OBJECT_BUCKET:-corca-texlive-production}"
OBJECT_PREFIX="${TEXLIVE_OBJECT_PREFIX:-}"
EMSDK_IMAGE="${EMSDK_IMAGE:-emscripten/emsdk:3.1.46}"
WORK="${WORK_DIR:-/tmp/icu-data}"
UPLOAD=0
[ "${1:-}" = "--upload" ] && UPLOAD=1

command -v docker >/dev/null || { echo "docker required"; exit 1; }
mkdir -p "$WORK"
cd "$WORK"

# ICU's src tarball ships only the prebuilt data blob, not the data SOURCE (.ucm/.txt);
# the separate data archive has the source we need to (re)build the .dat.
[ -f "icu4c-${ICU_VER}-src.tgz" ] || \
  wget -q "https://github.com/unicode-org/icu/releases/download/release-${ICU_VER//_/-}/icu4c-${ICU_VER}-src.tgz"
[ -f "icu4c-${ICU_VER}-data.zip" ] || \
  wget -q "https://github.com/unicode-org/icu/releases/download/release-${ICU_VER//_/-}/icu4c-${ICU_VER}-data.zip"

# Build native ICU (clean toolchain in the emsdk image) -> data/out/tmp/icudt${MAJOR}l.dat.
# We ship the FULL data (gz ~11MB on the wire, cached once). Shrinking it is DEFERRED:
#   - ICU's databuilder filter DOES engage with `{"strategy":"additive","featureFilters":
#     {"conversion_mappings":"include","misc":"include","normalization":"include",
#     "ulayout":"include"}}` (keys must be real categories; the old `"*"`/`ubidi`/`uprops`
#     keys were silently ignored). It yields ~3MB gz...
#   - ...BUT that minimal set (and an icupkg locale/coll prune of the full data) both make
#     XeTeX's font manager fail at `ucnv_open(...)` -> "cannot read font names". So
#     ucnv_open has a runtime ICU dependency not captured by the build-time filter; only
#     the full dataset works. Isolating the missing category needs ICU-internal debugging.
docker run --rm --platform linux/amd64 -v "$WORK":/w -w /w "$EMSDK_IMAGE" bash -c "
  set -e
  rm -rf icu && tar xzf icu4c-${ICU_VER}-src.tgz
  cd icu/source && rm -rf data && unzip -q /w/icu4c-${ICU_VER}-data.zip
  rm -f data/in/icudt${ICU_MAJOR}l.dat
  ./configure >/tmp/c.log 2>&1
  make -j\$(nproc) >/tmp/m.log 2>&1
  export LD_LIBRARY_PATH=/w/icu/source/lib
  cp data/out/tmp/icudt${ICU_MAJOR}l.dat /w/icudt${ICU_MAJOR}l.dat
"
DAT="$WORK/icudt${ICU_MAJOR}l.dat"
[ -f "$DAT" ] || { echo "ICU data build produced no .dat"; exit 1; }
echo "Built $DAT ($(wc -c < "$DAT") bytes)"

if [ "$UPLOAD" = 1 ]; then
  gzip -9 -c "$DAT" > "$DAT.gz"
  OBJECT_PREFIX="${OBJECT_PREFIX#/}"; OBJECT_PREFIX="${OBJECT_PREFIX%/}"
  if [ -n "$OBJECT_PREFIX" ]; then
    OBJECT_KEY="$OBJECT_PREFIX/$YEAR/icudt${ICU_MAJOR}l.dat"
  else
    OBJECT_KEY="$YEAR/icudt${ICU_MAJOR}l.dat"
  fi
  DEST="s3://$OBJECT_BUCKET/$OBJECT_KEY"
  # Use the same provider/region/profile checks as every mirror publisher.
  existing=$(node "$SCRIPT_DIR/object-store.mjs" s3api list-objects-v2 \
    --bucket "$OBJECT_BUCKET" --prefix "$OBJECT_KEY" --max-keys 1 \
    --no-paginate --query KeyCount --output text)
  if [ "$existing" != 0 ]; then
    echo "Refusing to overwrite existing ICU data: $DEST" >&2
    exit 1
  fi
  echo "Uploading to $DEST (gzip) ..."
  node "$SCRIPT_DIR/object-store.mjs" s3 cp "$DAT.gz" "$DEST" \
    --content-encoding gzip --content-type application/octet-stream \
    --cache-control "public, max-age=31536000, immutable"
  echo "Uploaded immutable ICU data."
fi
