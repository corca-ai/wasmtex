# TeX Live 2026 dated engine release evidence (`df228a6`)

Engine release `2026-df228a6f964a208a` is built from WasmTex revision
`87132ab3fc15533bf39c6812ed1ce7cd0da2d243` and TeX Live source revision
`fb6158926661cb7a7246b3a94a0cb170a9624d5a`. Every build receipt binds its
artifacts to the immutable 2026-08-26 R2 mirror revision
`2026-ba38749b8714505a`, public URL
`https://texlive.corca.ai/snapshots/2026-ba38749b8714505a/2026/`, and provenance
SHA-256 `7c5ef0a46b6a52cd8aa4e4ad2256eb58d6bb2062c45dfa43e48def1dfa9faf00`.

## Native builds and mirror qualification

The six build families ran on GitHub-hosted Linux x86_64 runners:

- pdfTeX and BibTeX: run `33063076566`;
- BibTeX8: run `33063078826`;
- MakeIndex: run `33063080975`;
- XeTeX and dvipdfmx: run `33063082862`; and
- LuaHBTeX: run `33063085213`.

The R2 publication contains 168,942 objects and passed exact key, byte-length,
and SHA-256 verification. The assembled artifacts passed all seven browser
goldens and all seven Node/browser parity cases against the dated mirror. The
representative pdfLaTeX, XeLaTeX, and LuaLaTeX compile paths produced PDFs.
The LuaTeX compressed format grew to 4,019,209 bytes; the reviewed 2026 budget
is 4,100,000 bytes and the CI performance gate passed.

The complete corresponding source and its independent public hash verification
are recorded in
[`corresponding-source-2026-dated-df228a6.md`](corresponding-source-2026-dated-df228a6.md).
