#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
#
# Compare LuaHBTeX's public pdfe/pdfscanner behavior. The baseline image is a
# private, non-distributed test input; neither image name is embedded in evidence.
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 BASELINE_IMAGE CANDIDATE_IMAGE" >&2
  exit 2
fi

BASELINE_IMAGE="$1"
CANDIDATE_IMAGE="$2"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FIXTURE_GENERATOR="$SCRIPT_DIR/generate-pdf-compat-fixtures.mjs"
PROBE="$SCRIPT_DIR/probe-luahbtex-pdf-api.lua"

command -v docker >/dev/null || { echo "docker required" >&2; exit 1; }
command -v node >/dev/null || { echo "node required" >&2; exit 1; }

PDF_API_TMP_DIR="$(mktemp -d /tmp/wasmtex-luahbtex-pdf-api.XXXXXX)"
trap 'rm -rf -- "$PDF_API_TMP_DIR"' EXIT
mkdir -p "$PDF_API_TMP_DIR/fixtures"
node "$FIXTURE_GENERATOR" "$PDF_API_TMP_DIR/fixtures"

run_probe() {
  local image="$1"
  local output="$2"
  docker run --rm --platform linux/amd64 \
    -v "$PROBE:/probe.lua:ro" \
    -v "$PDF_API_TMP_DIR/fixtures:/fixtures:ro" \
    --entrypoint /build/native/texk/web2c/luahbtex \
    "$image" --luaonly /probe.lua /fixtures \
    | sed -n 's/^WASMTEX_PDF_API_JSON=//p' > "$output"
  test -s "$output" || { echo "LuaHBTeX PDF API probe produced no JSON" >&2; exit 1; }
}

run_probe "$BASELINE_IMAGE" "$PDF_API_TMP_DIR/baseline.json"
run_probe "$CANDIDATE_IMAGE" "$PDF_API_TMP_DIR/candidate.json"

node - \
  "$PDF_API_TMP_DIR/baseline.json" \
  "$PDF_API_TMP_DIR/candidate.json" \
  "$PDF_API_TMP_DIR/normalized.json" <<'NODE'
const { readFileSync, writeFileSync } = require('fs')
const baseline = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const candidate = JSON.parse(readFileSync(process.argv[3], 'utf8'))
const baselineDamaged = baseline.damaged
const candidateDamaged = candidate.damaged
delete baseline.damaged
delete candidate.damaged
const expected = JSON.stringify(baseline)
const actual = JSON.stringify(candidate)
if (actual !== expected) {
  throw new Error('LuaHBTeX pdfe/pdfscanner clean-input behavior changed')
}
if (baselineDamaged.opened && !candidateDamaged.opened) {
  throw new Error('candidate regressed repairable-PDF handling')
}
if (candidateDamaged.opened && candidateDamaged.pages !== 1) {
  throw new Error('candidate repaired the PDF with an unexpected page count')
}
if (baselineDamaged.opened &&
    JSON.stringify(baselineDamaged) !== JSON.stringify(candidateDamaged)) {
  throw new Error('candidate changed an already supported damaged-PDF result')
}
writeFileSync(process.argv[4], `${expected}\n`)
process.stdout.write(
  `repairable PDF: baseline=${baselineDamaged.opened}, candidate=${candidateDamaged.opened}\n`,
)
NODE

echo "LuaHBTeX pdfe/pdfscanner differential passed."
sha256sum "$PDF_API_TMP_DIR/normalized.json"
