#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
#
# Compare a non-distributed baseline XeTeX image with a WTPDF candidate image.
# The images must contain Node and /build/native/texk/web2c/xetex. This script
# does not build either image and must not be used to publish the baseline.
set -euo pipefail

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "Usage: $0 BASELINE_IMAGE CANDIDATE_IMAGE [TEXLIVE_IMAGE]" >&2
  exit 2
fi

BASELINE_IMAGE="$1"
CANDIDATE_IMAGE="$2"
TEXLIVE_IMAGE="${3:-texlive/texlive@sha256:a78cd7792625e4245dc73cd5db390f0b9e6c2c7c14ac8b6ca59f023ef25ea282}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FIXTURE_SCRIPT="$SCRIPT_DIR/build-xetex-pdf-visual-fixture.mjs"

command -v docker >/dev/null || { echo "docker required" >&2; exit 1; }
command -v pdftoppm >/dev/null || { echo "pdftoppm required" >&2; exit 1; }

VISUAL_TMP_DIR="$(mktemp -d /tmp/wasmtex-xetex-visual.XXXXXX)"
trap 'rm -rf -- "$VISUAL_TMP_DIR"' EXIT
BASELINE_DIR="$VISUAL_TMP_DIR/baseline"
CANDIDATE_DIR="$VISUAL_TMP_DIR/candidate"
mkdir -p "$BASELINE_DIR" "$CANDIDATE_DIR"

run_xetex() {
  local image="$1"
  local output="$2"
  docker run --rm --platform linux/amd64 \
    -v "$FIXTURE_SCRIPT:/fixture.mjs:ro" \
    -v "$output:/work" \
    --entrypoint node "$image" \
    /fixture.mjs /build/native/texk/web2c/xetex /work
}

run_converter() {
  local directory="$1"
  docker run --rm --platform linux/amd64 \
    -e FORCE_SOURCE_DATE=1 -e SOURCE_DATE_EPOCH=946684800 \
    -v "$directory:/work" -w /work "$TEXLIVE_IMAGE" \
    xdvipdfmx -q -o visual-probe.pdf visual-probe.xdv
}

run_xetex "$BASELINE_IMAGE" "$BASELINE_DIR"
run_xetex "$CANDIDATE_IMAGE" "$CANDIDATE_DIR"

for fixture in all-boxes.pdf rotations.pdf multipage.pdf visual-probe.tex; do
  cmp "$BASELINE_DIR/$fixture" "$CANDIDATE_DIR/$fixture"
done
cmp "$BASELINE_DIR/visual-probe.xdv" "$CANDIDATE_DIR/visual-probe.xdv"

run_converter "$BASELINE_DIR"
run_converter "$CANDIDATE_DIR"
cmp "$BASELINE_DIR/visual-probe.pdf" "$CANDIDATE_DIR/visual-probe.pdf"

pdftoppm -png -r 144 "$BASELINE_DIR/visual-probe.pdf" "$BASELINE_DIR/page" >/dev/null 2>&1
pdftoppm -png -r 144 "$CANDIDATE_DIR/visual-probe.pdf" "$CANDIDATE_DIR/page" >/dev/null 2>&1

baseline_pages=("$BASELINE_DIR"/page-*.png)
candidate_pages=("$CANDIDATE_DIR"/page-*.png)
if [ "${#baseline_pages[@]}" -ne 11 ] || [ "${#candidate_pages[@]}" -ne 11 ]; then
  echo "expected 11 raster pages" >&2
  exit 1
fi
for baseline_page in "${baseline_pages[@]}"; do
  page_name="${baseline_page##*/}"
  cmp "$baseline_page" "$CANDIDATE_DIR/$page_name"
done

(
  cd "$BASELINE_DIR"
  sha256sum page-*.png > raster-manifest.sha256
)
(
  cd "$CANDIDATE_DIR"
  sha256sum page-*.png > raster-manifest.sha256
)
cmp "$BASELINE_DIR/raster-manifest.sha256" "$CANDIDATE_DIR/raster-manifest.sha256"

echo "XeTeX visual differential passed (11 pages at 144 DPI)."
sha256sum \
  "$BASELINE_DIR/visual-probe.xdv" \
  "$BASELINE_DIR/visual-probe.pdf" \
  "$BASELINE_DIR/raster-manifest.sha256"
