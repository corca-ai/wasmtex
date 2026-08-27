# Corresponding-source evidence (release `2025-e7cfc9d2bc434fd3`)

The deterministic corresponding-source builder ran in a clean Linux/amd64
container with GNU tar. It assembled the receipt-named WasmTex source, pinned
TeX Live source with the unused `libs/pplib` tree removed, pinned Emscripten
source and verified port archives, build controls, receipts, and relink
instructions.

## Archive and verification

- File: `wasmtex-2025-e7cfc9d2bc434fd3-source.tar.xz`
- Size: 162,334,496 bytes
- SHA-256:
  `0bfb70cdb726c24aa645c4ab94da6b3a6ac29667b7fb45e0385b3236fbfe5f36`
- Source tag: `engine-2025-e7cfc9d2bc434fd3`, targeting exact receipt revision
  `a3dab435c3c780b736086744584ae1dc01f72fc5`

`scripts/check-corresponding-source.mjs` passed against the final engine asset
manifest. The public GitHub release download was then streamed and hashed
independently; its SHA-256 matched the value above.

The archive is published at
`https://github.com/corca-ai/wasmtex/releases/download/engine-2025-e7cfc9d2bc434fd3/wasmtex-2025-e7cfc9d2bc434fd3-source.tar.xz`.
That URL and hash are the release-cleared binding in
`public/wasmtex/2025/LICENSE-MANIFEST.json`.
