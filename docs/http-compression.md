# HTTP compression qualification

Compression decisions must distinguish HTTP content encoding from an engine's
file format. A filename without `.gz` does not establish that its payload is
uncompressed. The [optimization policy](engine-optimization-policy.md) requires
existing format bytes and immutable mirror inputs to retain their meaning.

## Read-only measurement

`scripts/profile-http-compression.mjs` accepts public asset URLs rather than an
application checkout. It compares identity and negotiated HTTP representations,
alternating their order over repeated GETs, without changing CDN configuration.

```bash
node scripts/profile-http-compression.mjs \
  --url https://texlive.corca.ai/snapshots/2026-ba38749b8714505a/2026/pdftex/26/amsmath.sty \
  --repetitions 3 --out /tmp/http-compression.json
```

The tool needs Node 24 and curl. It records status, content encoding, cache/edge,
encoded payload size, HTTP-decoded SHA-256 and elapsed time. Non-200 responses or
a changed decoded hash fail the command. The gzip-magic hint describes the
HTTP-decoded payload, not the transport encoding. Local gzip-6 and Brotli-5
sizes estimate another representation; they do not prove deployed savings.

curl runs sequentially with fresh connections. The tool does not reset edge
caches, measure browser reuse, include TLS framing, or qualify compiler output.
Run it separately from browser latency benchmarks to avoid resource contention.
The [Cloudflare compression contract](https://developers.cloudflare.com/speed/optimization/content/compression/)
and [compression rules](https://developers.cloudflare.com/rules/compression-rules/)
explain negotiated encoding; actual GET responses remain the evidence.

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
never imports a consumer repository. See [warmup](warmup.md) and
[mirror operations](texlive-mirror-operations.md) for the existing boundaries.
