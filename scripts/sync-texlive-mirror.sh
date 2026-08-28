#!/usr/bin/env bash
# Build a provenance-bound TeX Live mirror and optionally upload it.
# No WebAssembly compilation occurs in this script.
#
# Usage:
#   ./scripts/sync-texlive-mirror.sh
#   ./scripts/sync-texlive-mirror.sh --catalog-only
#   ./scripts/sync-texlive-mirror.sh --upload
#   ./scripts/sync-texlive-mirror.sh --catalog-only --upload
#
# Environment variables:
#   TEXLIVE_MIRROR_CONFIG     Snapshot config (default: initial 2025 release)
#   TEXLIVE_MIRROR_OVERRIDES  Snapshot-specific review decisions
#   TEXLIVE_SEMANTIC_OVERRIDES Snapshot-specific semantic supplements
#   TEXMF_DIST                Existing texmf-dist directory (optional for release archives)
#   TEXMF_ARCHIVE             Exact texmf archive used for TEXMF_DIST
#   TEXLIVE_TLPDB             Existing texlive.tlpdb (optional)
#   TEXLIVE_METADATA_ARCHIVE  Exact extra archive containing TEXLIVE_TLPDB
#   TEXLIVE_OBJECT_BUCKET     R2 destination bucket
#   TEXLIVE_OBJECT_ENDPOINT   R2 endpoint; required for upload
#   TEXLIVE_OBJECT_PREFIX     Optional immutable prefix before the snapshot
#   TEXLIVE_R2_PROFILE        Optional local CLI profile containing R2 credentials
#   TEXLIVE_RUNTIME_ASSETS_DIR Directory containing bloom-filter.bin and icudt68l.dat
#   TEXLIVE_DEPLOYED_URL      Existing CDN base URL checked by --catalog-only
#   WORK_DIR                  Working directory (default: /tmp/texlive-r2)

set -euo pipefail

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH='' cd -- "$SCRIPT_DIR/.." && pwd)
CONFIG="${TEXLIVE_MIRROR_CONFIG:-$SCRIPT_DIR/texlive-mirror-2025.json}"

json_value() {
  node -e '
    const value = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))
    const found = process.argv[2].split(".").reduce((current, key) => current?.[key], value)
    if (typeof found !== "string") process.exit(1)
    process.stdout.write(found)
  ' "$CONFIG" "$1"
}

TEXLIVE_YEAR=$(json_value texliveYear)
SOURCE_TYPE=$(json_value sourceType 2>/dev/null || printf '%s' release-archives)
CONFIG_NAME=$(basename "$CONFIG" .json)
CONFIG_SUFFIX=${CONFIG_NAME#texlive-mirror-}
OVERRIDES="${TEXLIVE_MIRROR_OVERRIDES:-$SCRIPT_DIR/texlive-mirror-overrides-$CONFIG_SUFFIX.json}"
COMPLETION_DEPLOYMENT="${TEXLIVE_COMPLETION_DEPLOYMENT:-$SCRIPT_DIR/texlive-completion-deployment-$TEXLIVE_YEAR.json}"
if [ "$SOURCE_TYPE" = release-archives ]; then
  TEXMF_TARBALL=$(json_value texmfArchive.filename)
  TEXMF_URL=$(json_value texmfArchive.url)
  TEXMF_SHA512=$(json_value texmfArchive.sha512)
  METADATA_TARBALL=$(json_value metadataArchive.filename)
  METADATA_URL=$(json_value metadataArchive.url)
  METADATA_SHA512=$(json_value metadataArchive.sha512)
  TLPDB_MEMBER=$(json_value tlpdb.archiveMember)
elif [ "$SOURCE_TYPE" != tlnet-repository ]; then
  echo "Unsupported mirror sourceType: $SOURCE_TYPE" >&2
  exit 1
fi

OBJECT_BUCKET="${TEXLIVE_OBJECT_BUCKET:-corca-texlive-production}"
OBJECT_ENDPOINT="${TEXLIVE_OBJECT_ENDPOINT:-}"
OBJECT_PREFIX="${TEXLIVE_OBJECT_PREFIX:-}"
OBJECT_PROFILE="${TEXLIVE_R2_PROFILE:-}"
WORK_DIR="${WORK_DIR:-/tmp/texlive-r2}"
RELEASE_ROOT="$WORK_DIR/release"
OBJECT_PREFIX="${OBJECT_PREFIX#/}"
OBJECT_PREFIX="${OBJECT_PREFIX%/}"
if [ -n "$OBJECT_PREFIX" ]; then
  OBJECT_YEAR_ROOT="s3://$OBJECT_BUCKET/$OBJECT_PREFIX/$TEXLIVE_YEAR"
else
  OBJECT_YEAR_ROOT="s3://$OBJECT_BUCKET/$TEXLIVE_YEAR"
fi
DEPLOYED_TEXLIVE_URL="${TEXLIVE_DEPLOYED_URL:-}"

object_store() {
  if [ -z "$OBJECT_ENDPOINT" ]; then
    echo "TEXLIVE_OBJECT_ENDPOINT is required for R2 access" >&2
    return 1
  fi
  case "$OBJECT_ENDPOINT" in
    https://*.r2.cloudflarestorage.com|https://*.r2.cloudflarestorage.com/) ;;
    *) echo "TEXLIVE_OBJECT_ENDPOINT must be a Cloudflare R2 endpoint" >&2; return 1 ;;
  esac
  set -- aws ${OBJECT_PROFILE:+--profile "$OBJECT_PROFILE"} --endpoint-url "$OBJECT_ENDPOINT" "$@"
  "$@"
}

DO_UPLOAD=false
CATALOG_ONLY=false
for arg in "$@"; do
  case "$arg" in
    --upload) DO_UPLOAD=true ;;
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
if [ "$CATALOG_ONLY" = true ] && [ -z "$DEPLOYED_TEXLIVE_URL" ]; then
  echo "TEXLIVE_DEPLOYED_URL is required for catalog-only verification" >&2
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

if [ "$SOURCE_TYPE" = tlnet-repository ]; then
  if [ -z "${TEXMF_DIST:-}" ] || [ -z "${TEXLIVE_TLPDB:-}" ]; then
    echo "A tlnet snapshot must be materialized before mirror generation." >&2
    echo "Run TEXLIVE_MIRROR_CONFIG=$CONFIG ./scripts/prepare-tlnet-snapshot.sh first," >&2
    echo "then provide its TEXMF_DIST and TEXLIVE_TLPDB paths." >&2
    exit 1
  fi
  TEXMF="$TEXMF_DIST"
  TLPDB="$TEXLIVE_TLPDB"
elif [ -n "${TEXMF_DIST:-}" ]; then
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

if [ "$SOURCE_TYPE" = tlnet-repository ]; then
  : "${TEXLIVE_MATERIALIZATION_RECEIPT:?set TEXLIVE_MATERIALIZATION_RECEIPT to the receipt emitted by prepare-tlnet-snapshot.sh}"
elif [ -n "${TEXLIVE_TLPDB:-}" ]; then
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

PROVENANCE_ARGS=(
  --texmf-dist "$TEXMF"
  --tlpdb "$TLPDB"
  --config "$CONFIG"
  --overrides "$OVERRIDES"
  --output "$STAGING_ROOT"
  --manifest "$STAGING_ROOT/texlive-provenance.json"
  --scope "$PROVENANCE_SCOPE"
)
if [ "$SOURCE_TYPE" = release-archives ]; then
  PROVENANCE_ARGS+=(
    --texmf-archive "$TEXMF_ARCHIVE"
    --metadata-archive "$TEXLIVE_METADATA_ARCHIVE"
  )
else
  PROVENANCE_ARGS+=(
    --materialization-receipt "$TEXLIVE_MATERIALIZATION_RECEIPT"
  )
fi
node "$SCRIPT_DIR/gen-texlive-provenance.mjs" "${PROVENANCE_ARGS[@]}"

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
SEMANTIC_OVERRIDES="${TEXLIVE_SEMANTIC_OVERRIDES:-$SCRIPT_DIR/tex-semantic-overrides-$TEXLIVE_YEAR.json}"
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
  case "/$OBJECT_PREFIX/" in
    *"/$MIRROR_REVISION/"*) ;;
    *) echo "TEXLIVE_OBJECT_PREFIX must contain mirror revision $MIRROR_REVISION" >&2; exit 1 ;;
  esac
  : "${TEXLIVE_RUNTIME_ASSETS_DIR:?set TEXLIVE_RUNTIME_ASSETS_DIR for immutable publication}"
  for asset in bloom-filter.bin icudt68l.dat; do
    [ -f "$TEXLIVE_RUNTIME_ASSETS_DIR/$asset" ] || {
      echo "required runtime asset is missing: $TEXLIVE_RUNTIME_ASSETS_DIR/$asset" >&2
      exit 1
    }
    cp "$TEXLIVE_RUNTIME_ASSETS_DIR/$asset" "$RELEASE_ROOT/$asset"
  done
  cp "$RELEASE_ROOT/texlive-provenance.json" \
    "$RELEASE_ROOT/catalog/$MIRROR_REVISION/texlive-provenance.json"
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
    existing=$(object_store s3 ls "$OBJECT_YEAR_ROOT/pdftex/" | sed -n '1p')
    if [ -n "$existing" ]; then
      echo "Refusing to modify existing prefix: $OBJECT_YEAR_ROOT/pdftex/" >&2
      echo "Use a new immutable snapshot prefix." >&2
      exit 1
    fi

    object_store s3 sync "$RELEASE_ROOT/pdftex/" "$OBJECT_YEAR_ROOT/pdftex/" \
      --cache-control "public, max-age=31536000, immutable"
  fi
  object_store s3 sync "$RELEASE_ROOT/catalog/" "$OBJECT_YEAR_ROOT/catalog/" \
    --cache-control "public, max-age=31536000, immutable"
  object_store s3 sync "$RELEASE_ROOT/semantic/" "$OBJECT_YEAR_ROOT/semantic/" \
    --cache-control "public, max-age=31536000, immutable"
  object_store s3 cp \
    "$RELEASE_ROOT/texlive-provenance.json" \
    "$OBJECT_YEAR_ROOT/catalog/$MIRROR_REVISION/texlive-provenance.json" \
    --cache-control "public, max-age=31536000, immutable"
  if [ "$CATALOG_ONLY" = true ]; then
    echo "Uploaded completion metadata to $OBJECT_YEAR_ROOT/"
  else
    object_store s3 cp "$RELEASE_ROOT/texlive-provenance.json" "$OBJECT_YEAR_ROOT/texlive-provenance.json" \
      --cache-control "public, max-age=31536000, immutable"
    for asset in bloom-filter.bin icudt68l.dat; do
      object_store s3 cp "$RELEASE_ROOT/$asset" "$OBJECT_YEAR_ROOT/$asset" \
        --cache-control "public, max-age=31536000, immutable"
    done
    node "$SCRIPT_DIR/verify-object-mirror.mjs" --local-root "$RELEASE_ROOT" --year "$TEXLIVE_YEAR"
    echo "Uploaded provenance-bound mirror to $OBJECT_YEAR_ROOT/"
  fi
else
  if [ "$CATALOG_ONLY" = true ]; then
    echo "No upload performed. Catalog metadata is ready for deployed-resource verification."
  else
    echo "No upload performed. Strict release clearance is required before --upload succeeds."
  fi
fi
