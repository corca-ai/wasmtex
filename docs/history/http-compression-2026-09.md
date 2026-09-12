# HTTP compression experiment — 2026-09-12

Historical measurements. The bundle proposal #127 mentioned at the end was
later closed without implementation; that recommendation is not active. See the [current compression guide](../http-compression.md)
for diagnostic commands and the active decision.

## September 12, 2026 decision

[Issue #128](https://github.com/corca-ai/wasmtex/issues/128) investigated extra
compressed assets after the cold-start integration work. No runtime, engine,
format, mirror or CDN rule change was adopted. Existing compression was effective
for the sampled uncompressed resources, and formats were already compressed.

The probe used Node 24.18.0, three identity/negotiated pairs per URL, and public
GETs through several US edges. Engine hosts served releases
`2025-d89c008b0cfdd8ca` and `2026-189e605bad83d618`; package URLs used mirror
`2026-ba38749b8714505a`. The source baseline was `bd804359`.

| Asset | Identity payload bytes | Negotiated payload bytes | Observed representation |
| --- | ---: | ---: | --- |
| pdfTeX 2025 `.fmt` | 3,633,014 | 3,633,014 | No HTTP encoding; payload has gzip magic |
| pdfTeX 2026 `.fmt` | 3,657,154 | 3,657,154 | No HTTP encoding; payload has gzip magic |
| pdfTeX 2026 checkpoint WASM | 2,701,068 | 806,245 | HTTP Brotli |
| XeTeX 2026 `.fmt.gz` | 3,920,543 | 3,920,543 | Existing gzip asset |
| `amsmath.sty` | 88,826 | 20,376 | HTTP Brotli |
| `pdftex.map` | 5,609,407 | 434,029 | HTTP Brotli |
| `lmroman8-bold.otf` | 112,404 | 54,260 | HTTP Brotli |

The table records first-pair sizes, not latency percentiles. Successful paired
responses retained identical HTTP-decoded SHA-256 values across repetitions.
The 2026 pdfTeX format expands to 11,589,688 bytes, starting with the engine's
`W2TX` format marker. Its published gzip bytes remain the engine input.
Re-gzipping the published 2025/2026 payload saves only 1.25%/1.27%; Brotli-5 saves
1.17%/0.47%. An extra wrapper therefore misses the predeclared 20% byte-saving
criterion before decompression, fallback and publication costs are considered.
Do not label the existing format `Content-Encoding: gzip`: that would change the
bytes delivered to a consumer. HTTP compression would need an additional layer.

The active pdfTeX SDK preload fetches its format URL directly. It does not try a
missing `.fmt.gz`. Unicode engines request their existing gzip formats; the
standalone `fetchGzWithFallback` helper is not evidence that pdfTeX makes an
extra request. A manually probed pdfTeX `.fmt.gz` returned 404, but it was not
observed as a production compiler dependency.

An initial map probe used the wrong format ID `5` and returned 404. The recorded
dependency identifies format `11`; the corrected three pairs succeeded. That
failure is an input error, not a deployed missing-map regression. Early HEAD
responses suggested a missing format compression opportunity; body inspection
and recompression rejected that hypothesis. Raw reports remain attached by
path/hash in the issue execution record; they are not generated SDK artifacts.

Further compression work is deferred until a new representative resource shows
material additional savings. Remaining sequential-request work belongs to the
separate [bundle experiment #127](https://github.com/corca-ai/wasmtex/issues/127).
Applications must measure their own first PDF and cache lifecycle; this tool
never imports a consumer repository. See [warmup](../warmup.md) and
[mirror operations](../texlive-mirror-operations.md) for the existing boundaries.
