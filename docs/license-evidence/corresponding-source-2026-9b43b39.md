# TeX Live 2026 corresponding-source evidence (`9b43b39`)

Engine release `2026-dd8ba19bc500cbb3` is bound to the corresponding-source
archive `wasmtex-2026-dd8ba19bc500cbb3-source.tar.xz` (150,185,732 bytes,
SHA-256 `6c5eaea74ee14d812fe3f158d9a00cea0f3df04fcb7a0898582017026ac3c263`).
It is published with the release tag
[`engine-2026-dd8ba19bc500cbb3`](https://github.com/corca-ai/wasmtex/releases/tag/engine-2026-dd8ba19bc500cbb3).

GitHub Actions run `33053604579` assembled and checked the archive on a native
x86_64 `ubuntu-latest` runner. The builder downloaded the six receipt-bound
2026 artifact families, verified their notices and asset manifest, assembled
the pinned WasmTex, TeX Live, Emscripten, and port sources, passed `xz --test`,
and ran `scripts/check-corresponding-source.mjs`. A separately downloaded copy
of the workflow artifact passed the same checker locally before publication;
the public release download was then hashed again and matched the value above.

The archive binds all engine receipts to WasmTex source revision
`9b43b3959aba8f3f8b39a4190deb8ac653e2f687`, TeX Live source revision
`fb6158926661cb7a7246b3a94a0cb170a9624d5a`, and Emscripten `3.1.46` commit
`19607820c447a13fd8d0b7680c56148427d6e1b8`. The bundled rebuild and relink
instructions cover pdfTeX/BibTeX, BibTeX8, MakeIndex, XeTeX/dvipdfmx, and
LuaHBTeX, including the TeX Live 2026 HarfBuzz-subset split.
