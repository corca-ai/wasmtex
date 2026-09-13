# Engine assets for SDK users

The installed SDK contains `lib/`, types and notices. Engines and base formats are
separate downloads. Complete [SDK installation](howto.md#installation), then use a
verified asset set for your chosen TeX Live year (`2025` by default, or `2026`).
You do not need to rebuild TeX to integrate the library.

## Download a verified set

The sync script belongs to the **WasmTex repository**, not your application's npm
scripts or the installed package. Run it from a checkout; no npm install is needed
for this Node script:

```bash
git clone https://github.com/corca-ai/wasmtex.git wasmtex-assets
cd wasmtex-assets
node scripts/sync-engine-assets.mjs \
  --from https://corca-ai.github.io/wasmtex/ \
  --version 2025 \
  --dest /absolute/path/to/your-app/public/wasmtex/2025
```

Use Node 24+. `--from` is the base containing `wasmtex/<year>/manifest.json`;
`--dest` is the **year directory itself**. For 2026, change both `--version` and
the destination suffix. The script defaults to eight concurrent downloads.
It requires a `release-cleared` manifest and verifies every file's size and SHA-256.
Keep the manifest, notices and receipts with the assets. For reproducible deployment,
retain that verified set rather than re-syncing a mutable deployment on every build.

## Configure the host

Serve the copied directory as static files. With `assetBaseUrl: '/'`, the compiler
requests `/wasmtex/2025/wasmtex-pdftex.worker.js` and its matching module, WASM and
format. The asset base is the parent of `wasmtex/`, not the year directory:

```ts
import { WasmTexCompiler } from 'wasmtex/headless'

const compiler = new WasmTexCompiler({
  assetBaseUrl: '/',
  texliveVersion: '2025',
  files: { 'main.tex': String.raw`\documentclass{article}\begin{document}Hello!\end{document}` },
})
```

For an app deployed under `/editor/`, serve `/editor/wasmtex/<year>/` and set
`assetBaseUrl: '/editor/'`. Headless defaults to `/`; the browser component can
also derive a base from its build/script URL. An explicit base avoids depending
on how the host rebundles the SDK. For Node, point `publicDir` at the local parent
of `wasmtex/`; follow the [Node recipe](headless.md#server-side-compilation-node).

`texliveUrl` is a different setting: it selects the **package/font mirror**, not
engine assets. Its default is an immutable snapshot for `texliveVersion`.
For a custom mirror, keep its year and [completion identity](language-integration.md)
aligned with the compile profile. A year match alone does not prove compatibility
between arbitrary WASM and format files; keep the manifest's exact set together.

## Diagnose setup problems

| Symptom | Check |
| --- | --- |
| Worker, module or WASM returns 404 / HTML | Request the exact asset URL; verify the base, year directory and static-file routing. |
| Engine starts but packages/fonts fail | Check the separate `texliveUrl`, mirror contents and host network policy. |
| Browser worker creation fails | Check same-origin worker restrictions, the host's CSP and asset response headers. |
| XeLaTeX or LuaLaTeX is unavailable in `WasmTex` | Use the [headless compiler](headless.md#engine-selection-xelatex--cjk); the built-in component compiles with pdfLaTeX. |
| `sw.js` is missing | Use `serviceWorker: false` on `WasmTex`, or serve the script with an allowed origin/scope. Headless never registers it. |
| Return visits still download files | Check [cache scope and offline prerequisites](warmup.md#persistent-cache). Engine downloads are separate from the TeX Live asset cache. |

Monaco and PDF.js workers need their own [browser worker setup](howto.md#worker-setup-required).
When distributing engines, retain their [third-party notices](../THIRD_PARTY_NOTICES.md)
and follow [proprietary integration](proprietary-integration.md). Maintainers changing
engine bytes should use the [build guide](engine-build.md) and [corresponding-source procedure](corresponding-source.md).
