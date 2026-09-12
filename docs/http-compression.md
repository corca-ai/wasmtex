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

## Current decision

No additional compression wrapper or CDN-rule change was adopted in
[experiment #128](https://github.com/corca-ai/wasmtex/issues/128). The sampled
formats already contained gzip payloads and additional compression missed the
predeclared savings threshold. Published format bytes must remain unchanged.
A `.fmt` suffix does not imply raw/uncompressed data; setting an HTTP gzip header
on an existing gzip-format payload would change the bytes the consumer receives.

The [dated measurements](history/http-compression-2026-09.md) retain exact URLs,
representations, hashes, mistakes and limits. They are not a current CDN-wide
compression audit. Retry only with new evidence of material whole-pipeline benefit.
The separate bundle proposal #127 was closed without implementation.
See [warmup](warmup.md) for preload behavior and
[mirror operations](texlive-mirror-operations.md) for publication.
