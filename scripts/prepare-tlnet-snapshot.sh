#!/usr/bin/env bash
# Materialize an immutable tlnet snapshot for the provenance/mirror pipeline.
# The installer verifies every package container against the pinned repository
# metadata; this wrapper additionally pins the installer and final texlive.tlpdb.

set -euo pipefail

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
CONFIG="${TEXLIVE_MIRROR_CONFIG:-$SCRIPT_DIR/texlive-mirror-2025-final.json}"
WORK_DIR="${WORK_DIR:-/tmp/wasmtex-tlnet-snapshot}"
INSTALL_ROOT="$WORK_DIR/install"

json_value() {
  node -e '
    const value = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))
    const found = process.argv[2].split(".").reduce((current, key) => current?.[key], value)
    if (typeof found !== "string") process.exit(1)
    process.stdout.write(found)
  ' "$CONFIG" "$1"
}

[ "$(json_value sourceType)" = tlnet-repository ] || {
  echo "prepare-tlnet-snapshot.sh requires sourceType=tlnet-repository" >&2
  exit 1
}

REPOSITORY_URL="${TEXLIVE_REPOSITORY_URL:-$(json_value repository.url)}"
REPOSITORY_URL="${REPOSITORY_URL%/}"
INSTALLER_FILENAME=$(json_value installer.filename)
INSTALLER_SHA512=$(json_value installer.sha512)
TLPDB_SHA256=$(json_value tlpdb.sha256)
INSTALLER_ARCHIVE="$WORK_DIR/$INSTALLER_FILENAME"
TLPDB="$WORK_DIR/texlive.tlpdb"
INSTALLER_DIR="$WORK_DIR/installer"
PROFILE="$WORK_DIR/install.profile"
MATERIALIZATION_RECEIPT="$WORK_DIR/tlnet-materialization.json"

sha_file() {
  algorithm="$1"
  path="$2"
  if command -v "sha${algorithm}sum" >/dev/null 2>&1; then
    "sha${algorithm}sum" "$path" | awk '{print $1}'
  else
    shasum -a "$algorithm" "$path" | awk '{print $1}'
  fi
}

download_verified() {
  url="$1"
  path="$2"
  algorithm="$3"
  expected="$4"
  label="$5"
  if [ ! -f "$path" ]; then
    curl --fail --location --retry 4 --output "$path.partial" "$url"
    mv "$path.partial" "$path"
  fi
  actual=$(sha_file "$algorithm" "$path")
  if [ "$actual" != "$expected" ]; then
    echo "$label SHA-$algorithm mismatch: expected $expected, got $actual" >&2
    exit 1
  fi
  echo "Verified $label: $actual"
}

mkdir -p "$WORK_DIR"
download_verified \
  "$REPOSITORY_URL/$INSTALLER_FILENAME" \
  "$INSTALLER_ARCHIVE" 512 "$INSTALLER_SHA512" "TeX Live installer"
download_verified \
  "$REPOSITORY_URL/tlpkg/texlive.tlpdb" \
  "$TLPDB" 256 "$TLPDB_SHA256" "TeX Live package database"

if [ ! -x "$INSTALLER_DIR/install-tl" ]; then
  mkdir -p "$INSTALLER_DIR"
  tar -xzf "$INSTALLER_ARCHIVE" -C "$INSTALLER_DIR" --strip-components=1
fi
if [ -e "$INSTALL_ROOT" ]; then
  echo "Refusing to reuse existing install root: $INSTALL_ROOT" >&2
  echo "Move it aside after reviewing it, then rerun." >&2
  exit 1
fi

cat >"$PROFILE" <<EOF
selected_scheme scheme-full
TEXDIR $INSTALL_ROOT
TEXMFCONFIG $INSTALL_ROOT/texmf-config
TEXMFHOME $INSTALL_ROOT/texmf-home
TEXMFLOCAL $INSTALL_ROOT/texmf-local
TEXMFSYSCONFIG $INSTALL_ROOT/texmf-config
TEXMFSYSVAR $INSTALL_ROOT/texmf-var
TEXMFVAR $INSTALL_ROOT/texmf-var
instopt_adjustpath 0
instopt_letter 0
instopt_portable 1
tlpdbopt_autobackup 0
tlpdbopt_create_formats 1
tlpdbopt_desktop_integration 0
tlpdbopt_file_assocs 0
tlpdbopt_generate_updmap 1
tlpdbopt_install_docfiles 1
tlpdbopt_install_srcfiles 1
tlpdbopt_post_code 0
EOF

perl "$INSTALLER_DIR/install-tl" -profile "$PROFILE" -repository "$REPOSITORY_URL"
[ -d "$INSTALL_ROOT/texmf-dist" ] || {
  echo "installer did not produce $INSTALL_ROOT/texmf-dist" >&2
  exit 1
}
node "$SCRIPT_DIR/tlnet-materialization-receipt.mjs" write \
  "$CONFIG" "$INSTALL_ROOT/texmf-dist" "$TLPDB" "$MATERIALIZATION_RECEIPT"

echo "Snapshot materialized and package checksums verified."
echo "Run the mirror pipeline with:"
echo "  TEXLIVE_MIRROR_CONFIG=$CONFIG TEXMF_DIST=$INSTALL_ROOT/texmf-dist TEXLIVE_TLPDB=$TLPDB TEXLIVE_MATERIALIZATION_RECEIPT=$MATERIALIZATION_RECEIPT WORK_DIR=$WORK_DIR/release-work ./scripts/sync-texlive-mirror.sh"
