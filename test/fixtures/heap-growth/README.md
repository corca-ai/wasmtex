# Converter heap growth workload

`large-rgb.png` is a 6000×6000, 8-bit RGB PNG: 108,000,000 decoded pixel bytes,
119,735 compressed bytes. Every pixel is `(240, 240, 240)`; PNG compression does
not change the decoder's required image capacity. SHA-256:
`84a750c9772adac3d1135dd24158d5396a274183715bbae5d52e529acf20fb9f`.

`project.json` embeds the image in a Latin Modern document and supplies body and
preamble edits. Its binary paths are relative to the JSON file. The diagnostic
reads those bytes into the SDK's binary project-file surface.

```bash
node scripts/profile-font-cpu.mjs --assets <flat-year-assets> --year 2026 \
  --engine xelatex --project test/fixtures/heap-growth/project.json \
  --trace false --heap-stats true --repetitions 5 \
  --cache-dir <shared-response-cache> --out <report-dir>
```

Compare cold conversion, repeated conversions and both edits. Confirm the
converter capacity actually grows beyond its initial allocation. This single
solid RGB workload does not qualify arbitrary PNG/JPEG/PDF image behavior;
the annual Unicode and project-switch image corpora remain required.
