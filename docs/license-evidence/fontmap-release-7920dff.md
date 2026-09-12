# Font-map release evidence (`7920dff`)

The font-map releases use engine source `7920dff0f2abd04d7760ba273bf51994c86ca0ff`.
They combine the separately reviewed missing-SFD correction (#134) and lookup
index (#132), merged in that order. The SDK package and immutable mirrors stay
unchanged; integrating applications own adoption.

## Artifact and source identity

Both annual families come from successful [run 34663466012](https://github.com/corca-ai/wasmtex/actions/runs/34663466012).
Unchanged families retain their exact previously pinned artifact/receipt pairs.
Schema-2 XeTeX receipts reuse original compressed formats from runs
`33882993816` (2025) and `33885502236` (2026). LuaHBTeX format reuse is unchanged.

| Year | Release | Mirror | Corresponding-source SHA-256 |
| --- | --- | --- | --- |
| 2025 | `2025-df051f6f6b50575f` | `2025-0d3fc73b65e39905` | `4c662e73e3dc719b15daa09269f65430d914f415660cd1b9ea37dc1be0c45f6c` |
| 2026 | `2026-ef72b734a6c387d0` | `2026-ba38749b8714505a` | `3bfe123f4fdddab984331fd451416432acebf8085680ad5bacd639b7930183db` |

The Linux GNU-tar source builder and official corresponding-source checker pass
for both archives. Each contains all receipt-named WasmTex revisions, pinned
upstream sources, verified port archives, assembly tools and relink material.
No integrating-application source is included.

## Final runtime qualification

The shipped dvipdfmx JS/WASM/worker bytes match the qualified indexed diagnostic
builds. The 2025 XeTeX files also match that diagnostic asset set. Rebuilding the
2026 XeTeX family selects a previously documented link-order variant.

Using the same final harness on both sides, 64 paired Chromium compiles compare
the diagnostic and receipt-bound release. All PDFs, auxiliary files, errors,
diagnostics, logs, geometry, dependencies, conversion inputs and request outcomes
match. Four projects per year cover map replacement/removal, subfonts, conversion
failure and recovery, and multi-file references. Base-format use is asserted.
The earlier attempt to compare historical reports was rejected because harness
hashes differed; fresh baseline runs establish the final comparison.

Node output-preservation checks pass the two root documents on both annual
lines. Both sides retain identical nested-main failures, separately recorded
under [#135](https://github.com/corca-ai/wasmtex/issues/135); this is not nested
XeTeX support. Fixed clocks are test-only CommonJS preloads, and PDF normalization
still removes only metadata dates and document IDs. The font-map corpus returns
no XeTeX SyncTeX, so its geometry comparison is not a SyncTeX coverage claim.

[Golden Canary 34665332299](https://github.com/corca-ai/wasmtex/actions/runs/34665332299)
passes both annual browser goldens and Node/browser parity. No golden output was
updated. Annual release-mode licensing, notices, binary-size budgets and all
license-tool tests pass.

## Independent Linux rebuild

Both XeTeX/dvipdfmx families were independently rebuilt with the digest-pinned
Emscripten 3.1.46 image, `--no-cache --pull`, and network-disabled runtime build
containers. Native parallelism and runtime CPU allocation were bounded to eight.
Unchanged families retain earlier rebuild evidence; they were not rebuilt again.

The build reused archived upstream and SHA-512-verified port sources, and used
the receipt's exact WasmTex source revision. After source-archive creation, all
62 archived `wasm-build` files were compared with those inputs. Dockerfile
transport adaptations copy archived sources, clear compiled port caches, and
preseed verified port sources; their diffs are retained. No runtime source patch
was added by the rebuild harness.

Every non-format output claimed by the XeTeX receipt must exist. Both dvipdfmx
triples, XeTeX workers, and resolver observers reproduce byte-for-byte.
XeTeX generated JS/WASM have pinned-toolchain link-order differences:

| Year | Rebuilt XeTeX WASM SHA-256 | Link-map records | Changed sequence positions |
| --- | --- | --- | --- |
| 2025 | `facfd90eb9c93e4682a1f1773dbbd71ab7a9bea7c6132e5280c47b0ecc42b1db` | 16,731 | 6,993 |
| 2026 | `8e79f6f060eb7e652f2337c83827ab6614b66e334d9e7c1f6d7e25867102b931` | 17,054 | 6,587 |

After removing address/offset/size columns, link-record multisets match exactly.
All six JavaScript `invoke_*` bodies and remaining JavaScript match; only their
ordering can differ. No linked archive, member or symbol is added or removed.
The rebuilt files are staged and executed: another 64 paired Chromium compiles
match the receipt-bound release, and both annual Node root corpora match.
Nested failure equality is retained separately. Shipping files remain CI bytes.

## Measurement and distribution

The [diagnostic measurement](../compile-performance.md#font-map-index-qualification)
reports 6.1–6.6% faster repeated XeLaTeX compiles and about 26% faster conversion.
This release qualification establishes equivalence to those bytes; concurrent
release-validation timings are not a new performance measurement.

Each `engine-<release-id>` GitHub release carries engines, complete source, and
`wasmtex-fontmap-release-evidence.tar.gz`, with SHA-256 sidecars. The evidence
includes raw comparisons, build logs, input hashes and reproduction scripts.
Consumers retain their selected mirror, original formats and visible TeX Live
choices while registering a verified engine successor.
