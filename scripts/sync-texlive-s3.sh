#!/usr/bin/env bash
# Build a provenance-bound TeX Live mirror and optionally upload it.
# No WebAssembly compilation occurs in this script.
#
# Usage:
#   ./scripts/sync-texlive-s3.sh
#   ./scripts/sync-texlive-s3.sh --catalog-only
#   ./scripts/sync-texlive-s3.sh --upload
#   ./scripts/sync-texlive-s3.sh --catalog-only --upload
#   ./scripts/sync-texlive-s3.sh --upload --replace-existing
#
# Environment variables:
#   TEXMF_DIST                Existing texmf-dist directory (optional)
#   TEXMF_ARCHIVE             Exact texmf archive used for TEXMF_DIST
#   TEXLIVE_TLPDB             Existing texlive.tlpdb (optional)
#   TEXLIVE_METADATA_ARCHIVE  Exact extra archive containing TEXLIVE_TLPDB
#   S3_BUCKET                 Bucket served by the runtime CDN
#   TEXLIVE_DEPLOYED_URL      Existing CDN base URL checked by --catalog-only
#   WORK_DIR                  Working directory (default: /tmp/texlive-s3)

set -euo pipefail

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH='' cd -- "$SCRIPT_DIR/.." && pwd)
CONFIG="$SCRIPT_DIR/texlive-mirror-2025.json"
OVERRIDES="$SCRIPT_DIR/texlive-mirror-overrides-2025.json"
COMPLETION_DEPLOYMENT="$SCRIPT_DIR/texlive-completion-deployment-2025.json"

json_value() {
  node -e '
    const value = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))
    const found = process.argv[2].split(".").reduce((current, key) => current?.[key], value)
    if (typeof found !== "string") process.exit(1)
    process.stdout.write(found)
  ' "$CONFIG" "$1"
}

TEXLIVE_YEAR=$(json_value texliveYear)
TEXMF_TARBALL=$(json_value texmfArchive.filename)
TEXMF_URL=$(json_value texmfArchive.url)
TEXMF_SHA512=$(json_value texmfArchive.sha512)
METADATA_TARBALL=$(json_value metadataArchive.filename)
METADATA_URL=$(json_value metadataArchive.url)
METADATA_SHA512=$(json_value metadataArchive.sha512)
TLPDB_MEMBER=$(json_value tlpdb.archiveMember)

S3_BUCKET="${S3_BUCKET:-corca-wasmtex-texlib}"
WORK_DIR="${WORK_DIR:-/tmp/texlive-s3}"
RELEASE_ROOT="$WORK_DIR/release"
S3_YEAR_ROOT="s3://$S3_BUCKET/$TEXLIVE_YEAR"
DEPLOYED_TEXLIVE_URL="${TEXLIVE_DEPLOYED_URL:-https://d1jectpaw0dlvl.cloudfront.net/$TEXLIVE_YEAR/}"

DO_UPLOAD=false
REPLACE_EXISTING=false
CATALOG_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --upload) DO_UPLOAD=true ;;
    --replace-existing) REPLACE_EXISTING=true ;;
    --catalog-only) CATALOG_ONLY=true ;;
    --help|-h)
      sed -n '2,17s/^# //p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done
if [ "$REPLACE_EXISTING" = true ] && [ "$DO_UPLOAD" != true ]; then
  echo "--replace-existing requires --upload" >&2
  exit 1
fi
if [ "$REPLACE_EXISTING" = true ] && [ "$CATALOG_ONLY" = true ]; then
  echo "--replace-existing is not used by the immutable catalog-only lane" >&2
  exit 1
fi

sha512_file() {
  if command -v sha512sum >/dev/null 2>&1; then
    sha512sum "$1" | awk '{print $1}'
  else
    shasum -a 512 "$1" | awk '{print $1}'
  fi
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

verify_archive() {
  archive_path="$1"
  expected_hash="$2"
  label="$3"
  actual_hash=$(sha512_file "$archive_path")
  if [ "$actual_hash" != "$expected_hash" ]; then
    echo "$label SHA-512 mismatch" >&2
    echo "  expected: $expected_hash" >&2
    echo "  actual:   $actual_hash" >&2
    exit 1
  fi
  echo "Verified $label: $actual_hash"
}

download_archive() {
  archive_url="$1"
  archive_path="$2"
  expected_hash="$3"
  label="$4"
  if [ ! -f "$archive_path" ]; then
    partial_path="$archive_path.partial"
    echo "Downloading $label ..."
    curl --fail --location --progress-bar --output "$partial_path" "$archive_url"
    mv "$partial_path" "$archive_path"
  fi
  verify_archive "$archive_path" "$expected_hash" "$label"
}

mkdir -p "$WORK_DIR"

if [ -n "${TEXMF_DIST:-}" ]; then
  TEXMF="$TEXMF_DIST"
  if [ -z "${TEXMF_ARCHIVE:-}" ]; then
    echo "TEXMF_ARCHIVE is required when TEXMF_DIST is supplied" >&2
    exit 1
  fi
  verify_archive "$TEXMF_ARCHIVE" "$TEXMF_SHA512" "TeX Live texmf archive"
else
  TEXMF_ARCHIVE="$WORK_DIR/$TEXMF_TARBALL"
  download_archive "$TEXMF_URL" "$TEXMF_ARCHIVE" "$TEXMF_SHA512" "TeX Live texmf archive"
  TEXMF="$WORK_DIR/${TEXMF_TARBALL%.tar.xz}/texmf-dist"
  if [ ! -d "$TEXMF" ]; then
    echo "Extracting $TEXMF_TARBALL ..."
    tar xJf "$TEXMF_ARCHIVE" -C "$WORK_DIR"
  fi
fi
[ -d "$TEXMF" ] || { echo "texmf-dist not found at $TEXMF" >&2; exit 1; }

if [ -n "${TEXLIVE_TLPDB:-}" ]; then
  TLPDB="$TEXLIVE_TLPDB"
  if [ -z "${TEXLIVE_METADATA_ARCHIVE:-}" ]; then
    echo "TEXLIVE_METADATA_ARCHIVE is required when TEXLIVE_TLPDB is supplied" >&2
    exit 1
  fi
  verify_archive \
    "$TEXLIVE_METADATA_ARCHIVE" \
    "$METADATA_SHA512" \
    "TeX Live metadata archive"
else
  TEXLIVE_METADATA_ARCHIVE="$WORK_DIR/$METADATA_TARBALL"
  download_archive \
    "$METADATA_URL" \
    "$TEXLIVE_METADATA_ARCHIVE" \
    "$METADATA_SHA512" \
    "TeX Live metadata archive"
  TLPDB="$WORK_DIR/texlive.tlpdb"
  if [ ! -f "$TLPDB" ]; then
    echo "Extracting pinned texlive.tlpdb ..."
    tlpdb_partial="$TLPDB.partial"
    tar xJOf "$TEXLIVE_METADATA_ARCHIVE" "$TLPDB_MEMBER" > "$tlpdb_partial"
    mv "$tlpdb_partial" "$TLPDB"
  fi
fi
[ -f "$TLPDB" ] || { echo "texlive.tlpdb not found at $TLPDB" >&2; exit 1; }

STAGING_ROOT=$(mktemp -d "$WORK_DIR/release.XXXXXX")
cleanup() {
  if [ -d "$STAGING_ROOT" ]; then
    rm -rf "$STAGING_ROOT"
  fi
}
trap cleanup EXIT HUP INT TERM

PROVENANCE_SCOPE="full-mirror"
if [ "$CATALOG_ONLY" = true ]; then
  PROVENANCE_SCOPE="completion-metadata"
fi

node "$SCRIPT_DIR/gen-texlive-provenance.mjs" \
  --texmf-dist "$TEXMF" \
  --tlpdb "$TLPDB" \
  --texmf-archive "$TEXMF_ARCHIVE" \
  --metadata-archive "$TEXLIVE_METADATA_ARCHIVE" \
  --config "$CONFIG" \
  --overrides "$OVERRIDES" \
  --output "$STAGING_ROOT" \
  --manifest "$STAGING_ROOT/texlive-provenance.json" \
  --scope "$PROVENANCE_SCOPE"

if [ "$CATALOG_ONLY" = true ]; then
  node "$SCRIPT_DIR/reconcile-deployed-completion.mjs" \
    --manifest "$STAGING_ROOT/texlive-provenance.json" \
    --mirror-root "$STAGING_ROOT" \
    --base-url "$DEPLOYED_TEXLIVE_URL" \
    --policy "$COMPLETION_DEPLOYMENT"
  node "$SCRIPT_DIR/check-texlive-provenance.mjs" \
    "$STAGING_ROOT/texlive-provenance.json" \
    "$STAGING_ROOT" \
    --completion-metadata
else
  node "$SCRIPT_DIR/check-texlive-provenance.mjs" \
    "$STAGING_ROOT/texlive-provenance.json" \
    "$STAGING_ROOT"
fi

MIRROR_REVISION=$(node -e '
  const value = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))
  if (!/^\d{4}-[a-f0-9]{16}$/.test(value.mirrorRevision ?? "")) process.exit(1)
  process.stdout.write(value.mirrorRevision)
' "$STAGING_ROOT/texlive-provenance.json")
CATALOG_ROOT="$STAGING_ROOT/catalog/$MIRROR_REVISION"
node "$SCRIPT_DIR/gen-texlive-catalog.mjs" \
  --manifest "$STAGING_ROOT/texlive-provenance.json" \
  --output "$CATALOG_ROOT"
node "$SCRIPT_DIR/check-texlive-catalog.mjs" \
  "$STAGING_ROOT/texlive-provenance.json" \
  "$CATALOG_ROOT"
SEMANTIC_ROOT="$STAGING_ROOT/semantic/$MIRROR_REVISION"
SEMANTIC_OVERRIDES="$SCRIPT_DIR/tex-semantic-overrides-$TEXLIVE_YEAR.json"
node "$SCRIPT_DIR/gen-tex-semantic-catalog.mjs" \
  --manifest "$STAGING_ROOT/texlive-provenance.json" \
  --mirror-root "$STAGING_ROOT" \
  --overrides "$SEMANTIC_OVERRIDES" \
  --output "$SEMANTIC_ROOT"
node "$SCRIPT_DIR/check-tex-semantic-catalog.mjs" \
  --manifest "$STAGING_ROOT/texlive-provenance.json" \
  --mirror-root "$STAGING_ROOT" \
  --overrides "$SEMANTIC_OVERRIDES" \
  --catalog "$SEMANTIC_ROOT"

if [ -e "$RELEASE_ROOT" ]; then
  PREVIOUS_ROOT="$WORK_DIR/release.previous"
  if [ -e "$PREVIOUS_ROOT" ]; then
    echo "Refusing to overwrite preserved previous mirror: $PREVIOUS_ROOT" >&2
    echo "Review and remove or relocate it, then rerun." >&2
    exit 1
  fi
  mv "$RELEASE_ROOT" "$PREVIOUS_ROOT"
  echo "Preserved previous mirror at $PREVIOUS_ROOT"
fi
mv "$STAGING_ROOT" "$RELEASE_ROOT"
trap - EXIT HUP INT TERM

PROVENANCE_SHA256=$(sha256_file "$RELEASE_ROOT/texlive-provenance.json")
echo "Mirror ready: $RELEASE_ROOT"
echo "Provenance SHA-256: $PROVENANCE_SHA256"

if [ "$DO_UPLOAD" = true ]; then
  cd "$PROJECT_ROOT"
  if [ "$CATALOG_ONLY" = true ]; then
    node "$SCRIPT_DIR/check-texlive-provenance.mjs" \
      "$RELEASE_ROOT/texlive-provenance.json" \
      "$RELEASE_ROOT" \
      --completion-metadata
  else
    npm run check:licenses -- --release
    node "$SCRIPT_DIR/check-texlive-provenance.mjs" \
      "$RELEASE_ROOT/texlive-provenance.json" \
      "$RELEASE_ROOT" \
      --release
  fi
  node "$SCRIPT_DIR/check-texlive-catalog.mjs" \
    "$RELEASE_ROOT/texlive-provenance.json" \
    "$RELEASE_ROOT/catalog/$MIRROR_REVISION"
  node "$SCRIPT_DIR/check-tex-semantic-catalog.mjs" \
    --manifest "$RELEASE_ROOT/texlive-provenance.json" \
    --mirror-root "$RELEASE_ROOT" \
    --overrides "$SEMANTIC_OVERRIDES" \
    --catalog "$RELEASE_ROOT/semantic/$MIRROR_REVISION"

  if [ "$CATALOG_ONLY" != true ]; then
    existing=$(aws s3 ls "$S3_YEAR_ROOT/pdftex/" | sed -n '1p')
    if [ -n "$existing" ] && [ "$REPLACE_EXISTING" != true ]; then
      echo "Refusing to modify existing prefix: $S3_YEAR_ROOT/pdftex/" >&2
      echo "Use a new version prefix, or rerun with the explicit --replace-existing flag." >&2
      exit 1
    fi

    if [ "$REPLACE_EXISTING" = true ]; then
      aws s3 sync "$RELEASE_ROOT/pdftex/" "$S3_YEAR_ROOT/pdftex/" --delete
    else
      aws s3 sync "$RELEASE_ROOT/pdftex/" "$S3_YEAR_ROOT/pdftex/"
    fi
  fi
  aws s3 sync "$RELEASE_ROOT/catalog/" "$S3_YEAR_ROOT/catalog/"
  aws s3 sync "$RELEASE_ROOT/semantic/" "$S3_YEAR_ROOT/semantic/"
  aws s3 cp \
    "$RELEASE_ROOT/texlive-provenance.json" \
    "$S3_YEAR_ROOT/catalog/$MIRROR_REVISION/texlive-provenance.json"
  if [ "$CATALOG_ONLY" = true ]; then
    echo "Uploaded completion metadata to $S3_YEAR_ROOT/"
  else
    aws s3 cp "$RELEASE_ROOT/texlive-provenance.json" "$S3_YEAR_ROOT/texlive-provenance.json"
    echo "Uploaded provenance-bound mirror to $S3_YEAR_ROOT/"
  fi
else
  if [ "$CATALOG_ONLY" = true ]; then
    echo "No upload performed. Catalog metadata is ready for deployed-resource verification."
  else
    echo "No upload performed. Strict release clearance is required before --upload succeeds."
  fi
fi
