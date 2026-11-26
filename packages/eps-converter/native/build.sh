#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
output=${1:?Specify an output directory}
mkdir -p "$output"
output=$(cd "$output" && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

revision=0184a97bc3d902e2e63d145925448aeb43566d10
source_hash=9a45f0f1835750a5e54cdbc5c5413a3e93b2aad9f4d917047aa983cf8cfc98a2
if [[ -n "${STET_SOURCE_ARCHIVE:-}" ]]; then
    cp "$STET_SOURCE_ARCHIVE" "$work/upstream.tar.gz"
else
    curl -fsSL --max-time 120 "https://codeload.github.com/AndyCappDev/stet/tar.gz/$revision" -o "$work/upstream.tar.gz"
fi
printf '%s  %s\n' "$source_hash" "$work/upstream.tar.gz" | shasum -a 256 -c -
mkdir -p "$work/upstream" "$output/package"
tar -xzf "$work/upstream.tar.gz" --strip-components=1 -C "$work/upstream"
git -C "$work/upstream" apply --no-index "$here/type42.patch" "$here/strict-pdf.patch" "$here/bounding-box.patch"
cp "$here/Cargo.toml" "$here/Cargo.lock" "$work/"
cp -R "$here/src" "$work/"
cp "$work/upstream/about.toml" "$work/upstream/about.hbs" "$work/"
cd "$work"
wasm-bindgen --version | grep -Fx 'wasm-bindgen 0.2.128'
cargo +1.96.0 about --version | grep -Fx 'cargo-about 0.9.3'
RUSTFLAGS='-C target-feature=+simd128 -C link-arg=--max-memory=134217728' \
    cargo +1.96.0 build --locked --release --target wasm32-unknown-unknown
wasm-bindgen --target web --out-name stet --out-dir "$output/package" target/wasm32-unknown-unknown/release/cortex_stet_eps.wasm
cp upstream/crates/stet/LICENSE-URW-FONTS "$output/package/LICENSE-URW-FONTS.txt"
{
    printf '%s\n\n' 'WasmTex optional EPS converter. Stet is available under the MIT or Apache 2.0 license.'
    for notice in upstream/LICENSE-MIT upstream/LICENSE-APACHE \
        upstream/crates/stet/LICENSE-URW-FONTS upstream/crates/stet/LICENSE-CMYK-PROFILE \
        upstream/crates/stet-fonts/LICENSE-ADOBE-CMAP upstream/crates/stet-fonts/LICENSE-ADOBE-AGL; do
        printf '\n======== %s ========\n\n' "${notice##*/}"
        cat "$notice"
    done
    printf '\n======== Linked Rust crates ========\n\n'
    cargo +1.96.0 about generate --locked --fail --target wasm32-unknown-unknown about.hbs
} > "$output/package/THIRD_PARTY_NOTICES.txt"
