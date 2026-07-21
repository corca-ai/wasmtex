#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
set -euo pipefail

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "Usage: $0 BASELINE_IMAGE CANDIDATE_IMAGE [TEXLIVE_IMAGE]" >&2
  exit 2
fi

BASELINE_IMAGE="$1"
CANDIDATE_IMAGE="$2"
TEXLIVE_IMAGE="${3:-texlive/texlive@sha256:a78cd7792625e4245dc73cd5db390f0b9e6c2c7c14ac8b6ca59f023ef25ea282}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GENERATOR="$SCRIPT_DIR/generate-pdf-compat-fixtures.mjs"
PROBE="$SCRIPT_DIR/test-xetex-pdf-extended.mjs"

command -v docker >/dev/null || { echo "docker required" >&2; exit 1; }
command -v node >/dev/null || { echo "node required" >&2; exit 1; }
command -v pdftoppm >/dev/null || { echo "pdftoppm required" >&2; exit 1; }

EXTENDED_TMP_DIR="$(mktemp -d /tmp/wasmtex-xetex-extended.XXXXXX)"
trap 'rm -rf -- "$EXTENDED_TMP_DIR"' EXIT
node "$GENERATOR" "$EXTENDED_TMP_DIR/fixtures"
mkdir -p "$EXTENDED_TMP_DIR/baseline" "$EXTENDED_TMP_DIR/candidate"
cp "$EXTENDED_TMP_DIR"/fixtures/*.pdf "$EXTENDED_TMP_DIR/baseline/"
cp "$EXTENDED_TMP_DIR"/fixtures/*.pdf "$EXTENDED_TMP_DIR/candidate/"

run_probe() {
  local image="$1"
  local output="$2"
  docker run --rm --platform linux/amd64 \
    -v "$PROBE:/probe.mjs:ro" -v "$output:/work" \
    --entrypoint node "$image" \
    /probe.mjs /build/native/texk/web2c/xetex /work
  docker run --rm --platform linux/amd64 \
    -e FORCE_SOURCE_DATE=1 -e SOURCE_DATE_EPOCH=946684800 \
    -v "$output:/work" -w /work "$TEXLIVE_IMAGE" \
    xdvipdfmx -q -o extended-probe.pdf extended-probe.xdv
  pdftoppm -png -r 144 "$output/extended-probe.pdf" "$output/page" >/dev/null 2>&1
}

run_probe "$BASELINE_IMAGE" "$EXTENDED_TMP_DIR/baseline"
run_probe "$CANDIDATE_IMAGE" "$EXTENDED_TMP_DIR/candidate"

cmp "$EXTENDED_TMP_DIR/baseline/clean.json" "$EXTENDED_TMP_DIR/candidate/clean.json"
cmp "$EXTENDED_TMP_DIR/baseline/extended-probe.xdv" "$EXTENDED_TMP_DIR/candidate/extended-probe.xdv"
cmp "$EXTENDED_TMP_DIR/baseline/extended-probe.pdf" "$EXTENDED_TMP_DIR/candidate/extended-probe.pdf"
for baseline_page in "$EXTENDED_TMP_DIR"/baseline/page-*.png; do
  cmp "$baseline_page" "$EXTENDED_TMP_DIR/candidate/${baseline_page##*/}"
done

node - "$EXTENDED_TMP_DIR/baseline/diagnostics.json" "$EXTENDED_TMP_DIR/candidate/diagnostics.json" <<'NODE'
const { readFileSync } = require('fs')
const baseline = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const candidate = JSON.parse(readFileSync(process.argv[3], 'utf8'))
if (candidate.encryptedPages !== 0 || baseline.encryptedPages !== 0) {
  throw new Error('encrypted PDF unexpectedly became readable without a password')
}
if (baseline.damagedPages > 0 && candidate.damagedPages === 0) {
  throw new Error('candidate regressed repairable-PDF handling')
}
process.stdout.write(`repairable PDF page count: baseline=${baseline.damagedPages}, candidate=${candidate.damagedPages}\n`)
NODE

echo "XeTeX extended PDF differential passed (clean output byte-identical)."
sha256sum \
  "$EXTENDED_TMP_DIR/baseline/clean.json" \
  "$EXTENDED_TMP_DIR/baseline/extended-probe.xdv" \
  "$EXTENDED_TMP_DIR/baseline/extended-probe.pdf"
