#!/usr/bin/env bash
# Extract TeX Live files into flat S3 structure and optionally upload.
# No Docker required — downloads texmf tarball directly from CTAN historic archive.
#
# Usage:
#   ./scripts/sync-texlive-s3.sh            # extract only (to /tmp/texlive-s3/)
#   ./scripts/sync-texlive-s3.sh --upload   # extract + upload to S3
#
# Environment variables:
#   TEXMF_DIST   Use existing texmf-dist directory (skips download)
#   S3_BUCKET    S3 bucket name (default: corca-wasmtex-texlib — the bucket
#                served by the runtime CDN d1jectpaw0dlvl.cloudfront.net)
#   WORK_DIR     Working directory (default: /tmp/texlive-s3)

set -euo pipefail

TEXLIVE_YEAR=2025
TEXMF_TARBALL="texlive-20250308-texmf.tar.xz"
TEXMF_URL="https://ftp.math.utah.edu/pub/tex/historic/systems/texlive/${TEXLIVE_YEAR}/${TEXMF_TARBALL}"

# Default to the bucket the runtime CDN actually serves. The old default
# (corca-ai-texlive) no longer exists, so an --upload run silently created nothing
# useful; the live mirror lives in corca-wasmtex-texlib.
S3_BUCKET="${S3_BUCKET:-corca-wasmtex-texlib}"
WORK_DIR="${WORK_DIR:-/tmp/texlive-s3}"

DO_UPLOAD=false
for arg in "$@"; do
  case "$arg" in
    --upload) DO_UPLOAD=true ;;
    --help|-h)
      sed -n '2,12s/^# //p' "$0"
      exit 0
      ;;
  esac
done

OUT_DIR="$WORK_DIR/pdftex"
S3_PATH="s3://$S3_BUCKET/$TEXLIVE_YEAR/pdftex/"

# --- Step 1: Get texmf-dist ---

if [ -n "${TEXMF_DIST:-}" ]; then
  echo "Using local texmf-dist: $TEXMF_DIST"
  TEXMF="$TEXMF_DIST"
else
  TEXMF="$WORK_DIR/${TEXMF_TARBALL%.tar.xz}/texmf-dist"
  if [ ! -d "$TEXMF" ]; then
    echo "Downloading TeX Live $TEXLIVE_YEAR texmf (~2.9 GB)..."
    mkdir -p "$WORK_DIR"
    curl -L --progress-bar "$TEXMF_URL" | tar xJ -C "$WORK_DIR"
  else
    echo "Using cached texmf at $TEXMF"
  fi
fi

[ -d "$TEXMF" ] || { echo "Error: texmf-dist not found at $TEXMF"; exit 1; }

# --- Step 2: Extract into flat S3 structure ---

echo "Extracting files from $TEXMF ..."
rm -rf "$OUT_DIR"
# Format ids match kpathsea kpse_file_format_type. 4/36/47/51 (afm/truetype/
# opentype/lua) are needed by the XeLaTeX/LuaLaTeX engines (Stage 2).
mkdir -p "$OUT_DIR"/{3,4,6,7,10,11,26,32,33,36,44,47,51}

# Helper: copy files, skip duplicates (first-found wins)
copy_flat() {
  local src_dir="$1" dst_dir="$2" ext="${3:-}" strip_ext="${4:-false}"
  local n=0
  while IFS= read -r f; do
    local bn
    if [ "$strip_ext" = true ]; then
      bn=$(basename "$f" "$ext")
    else
      bn=$(basename "$f")
    fi
    if [ ! -f "$dst_dir/$bn" ]; then
      cp "$f" "$dst_dir/$bn"
      n=$((n + 1))
    fi
  done < <(find "$src_dir" -name "*${ext}" -type f)
  echo "$n"
}

# Type 26: TeX sources (.sty, .cls, .def, .tex, ...)
# Include the xetex/xelatex/luatex/lualatex trees so engine-specific packages
# (e.g. xetexko under tex/xetex, xeCJK, fontspec-luatex, luatexja) are mirrored —
# not just pdflatex's. (tex/xetex was previously omitted → xetexko missing.)
n26=0
for dir in \
  "$TEXMF/tex/latex" "$TEXMF/tex/generic" "$TEXMF/tex/plain" \
  "$TEXMF/tex/xetex" "$TEXMF/tex/xelatex" "$TEXMF/tex/luatex" "$TEXMF/tex/lualatex"; do
  if [ -d "$dir" ]; then
    c=$(copy_flat "$dir" "$OUT_DIR/26" "" false)
    n26=$((n26 + c))
  fi
done
echo "  type 26 (TeX sources): $n26 files"

# Type 3: TFM font metrics (strip .tfm extension)
n3=$(copy_flat "$TEXMF/fonts/tfm" "$OUT_DIR/3" ".tfm" true)
echo "  type  3 (TFM fonts):   $n3 files"

# Type 32: PostScript fonts (.pfb)
n32=$(copy_flat "$TEXMF/fonts/type1" "$OUT_DIR/32" ".pfb" false)
echo "  type 32 (PS fonts):    $n32 files"

# Type 33: Virtual fonts (strip .vf extension)
n33=$(copy_flat "$TEXMF/fonts/vf" "$OUT_DIR/33" ".vf" true)
echo "  type 33 (VF fonts):    $n33 files"

# Type 11: Font maps (.map) + Adobe Glyph Lists (.txt) used by dvipdfmx for the
# PDF ToUnicode CMap (text copy/paste & search). kpse resolves glyphlist.txt under
# the fontmap format, so they live alongside the .map files in dir 11.
n11=$(copy_flat "$TEXMF/fonts/map" "$OUT_DIR/11" ".map" false)
if [ -d "$TEXMF/fonts/map/glyphlist" ]; then
  nGL=$(copy_flat "$TEXMF/fonts/map/glyphlist" "$OUT_DIR/11" ".txt" false)
  n11=$((n11 + nGL))
fi
echo "  type 11 (font maps):   $n11 files"

# Type 44: Encoding files (.enc)
n44=$(copy_flat "$TEXMF/fonts/enc" "$OUT_DIR/44" ".enc" false)
echo "  type 44 (encodings):   $n44 files"

# --- Unicode-engine assets (XeLaTeX/LuaLaTeX) ---

# Type 47: OpenType fonts (.otf)
n47=$(copy_flat "$TEXMF/fonts/opentype" "$OUT_DIR/47" ".otf" false)
echo "  type 47 (OpenType):    $n47 files"

# Type 36: TrueType fonts (.ttf, .ttc)
n36=$(copy_flat "$TEXMF/fonts/truetype" "$OUT_DIR/36" ".ttf" false)
n36b=$(copy_flat "$TEXMF/fonts/truetype" "$OUT_DIR/36" ".ttc" false)
echo "  type 36 (TrueType):    $((n36 + n36b)) files"

# Type 4: AFM metrics (.afm) — used by fontspec for some Type1 families
n4=$(copy_flat "$TEXMF/fonts/afm" "$OUT_DIR/4" ".afm" false)
echo "  type  4 (AFM):         $n4 files"

# Type 51: Lua files (.lua) — luaotfload, lualibs, luatexja, package lua, scripts.
# This is LuaLaTeX's runtime: the recursive scan of tex/ and scripts/ covers
# tex/luatex/luaotfload, scripts/luaotfload and scripts/lualibs. LuaTeX needs NO
# separate font-list file (unlike XeTeX's xetexfontlist.txt) — luaotfload discovers
# fonts by resolving names through kpse against the mirrored 47/36/4 trees.
n51=0
for dir in "$TEXMF/tex" "$TEXMF/scripts"; do
  if [ -d "$dir" ]; then
    c=$(copy_flat "$dir" "$OUT_DIR/51" ".lua" false)
    n51=$((n51 + c))
  fi
done
echo "  type 51 (Lua):         $n51 files"

# Type 7: BibTeX style files (.bst)
n7=0
if [ -d "$TEXMF/bibtex/bst" ]; then
  n7=$(copy_flat "$TEXMF/bibtex/bst" "$OUT_DIR/7" ".bst" false)
fi
echo "  type  7 (BST styles):  $n7 files"

# Type 6: BibTeX support files (.bib — e.g. xampl.bib)
n6=0
if [ -d "$TEXMF/bibtex/bib" ]; then
  n6=$(copy_flat "$TEXMF/bibtex/bib" "$OUT_DIR/6" ".bib" false)
fi
echo "  type  6 (BIB support): $n6 files"

total=$(find "$OUT_DIR" -type f | wc -l | tr -d ' ')
size=$(du -sh "$OUT_DIR" | cut -f1)
echo ""
echo "Total: $total files ($size) in $OUT_DIR"

# --- Step 3: Upload to S3 ---

if [ "$DO_UPLOAD" = true ]; then
  echo ""
  echo "Uploading to $S3_PATH ..."
  aws s3 sync "$OUT_DIR/" "$S3_PATH" --size-only
  echo "Done."
else
  echo ""
  echo "Dry run complete. To upload:"
  echo "  $0 --upload"
  echo "  # or manually:"
  echo "  aws s3 sync $OUT_DIR/ $S3_PATH --size-only"
fi
