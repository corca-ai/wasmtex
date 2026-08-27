# TeX Live 2026 initial engine release evidence (`e4bc652`)

Engine release `2026-e4bc65275123982c` is built from WasmTex revision
`2f9ed38431af364ee8c10c6a7dcb06e185423534` and TeX Live source revision
`fb6158926661cb7a7246b3a94a0cb170a9624d5a`. Every build receipt binds its
artifacts to initial mirror revision `2026-b4f6befbe7732169`, public URL
`https://texlive.corca.ai/snapshots/2026-b4f6befbe7732169/2026/`, and provenance
SHA-256 `e3de2b970525f1a39e5d97da4ce1c3bbee4c16ecc78b9cc6fe1131c3020f5307`.

The six build families ran on native GitHub Linux x86_64 runners: pdfTeX and
BibTeX in run `33067203361`, BibTeX8 in `33067205526`, MakeIndex in
`33067207758`, XeTeX/dvipdfmx in `33067209911`, and LuaHBTeX in
`33067211879`.

The initial R2 publication contains 164,849 objects and passed exact key,
byte-length, and SHA-256 verification. The newly assembled mirror-bound engine
passed all seven 2026 browser goldens, all seven Node/browser parity cases, and
the Node pdfLaTeX smoke against the initial mirror. The representative browser
corpus exercises pdfLaTeX, XeLaTeX, and LuaLaTeX PDF production.

The complete corresponding source and its independent public hash verification
are recorded in
[`corresponding-source-2026-initial-e4bc652.md`](corresponding-source-2026-initial-e4bc652.md).
