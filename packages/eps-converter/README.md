# Optional WasmTex EPS converter

`@wasmtex/eps-converter` is a separate, opt-in EPS-to-PDF package. It is not a
WasmTex dependency and does not install an interpreter in `wasmtex/headless`.
Install the versioned `.tgz` from the WasmTex GitHub release and pin its digest.

Copy the complete `assets/` directory to your versioned static host. Keep
`stet.js` and `stet_bg.wasm` together and publish `THIRD_PARTY_NOTICES.txt` and
`LICENSE-URW-FONTS.txt` alongside them. `manifest.json` identifies exact payload
hashes, upstream source, local build inputs, toolchain and limits. Verify these
hashes during asset preparation; this loader does not implement an asset cache.

Run the adapter inside an application-owned module Worker:

```ts
import { loadEpsConverter } from '@wasmtex/eps-converter'

// Host-provided absolute URL to this release's assets/stet.js.
const converter = await loadEpsConverter(runtimeModuleUrl)
const pdf = await converter.convert({ bytes, signal })
const wasmCapacityBytes = converter.memoryBytes
```

Return `pdf` through your worker protocol to `WasmTexCompilerOptions.epsConverter`.
The callback receives `{ path, bytes, signal }`; the package's `convert` method
accepts that request structurally. Loading is explicit and does not start a
worker. The application owns version selection, hosting, loading, queues,
timeouts, cancellation, device memory policy and UI. Synchronous WASM cannot
observe an abort delivered while it runs; terminate its Worker to interrupt it.
Destroy the worker after a trap or timeout. `memoryBytes` is WASM capacity, not
whole-process or host-JS memory. A precompiled `WebAssembly.Module` can be passed
as the second loader argument for local hosts.

The converter rejects empty or >16 MiB input and native conversion errors,
including zero/multiple pages. The native build caps linear memory at 128 MiB,
local PostScript VM at 64 MiB and page dimensions at 14,400 points. Successful
conversion returns one cropped vector PDF page. Bounds and Type 42 rendering
patches are included. EPS is a programming language: unsupported operators or
fonts can still fail; there is no claim of complete Ghostscript compatibility.

## Source and distribution

Stet 0.11.0 is pinned to `0184a97bc3d902e2e63d145925448aeb43566d10`.
`native/` contains the wrapper, locked dependencies, three patches and source
build recipe transferred from CorTeX PR #2403. The historical native crate
name `cortex-stet-eps` is retained to preserve binary identity; it has no
application-code or project-schema dependency. Stet is MIT OR Apache-2.0;
URW++ Core 35 fonts are OFL-1.1. Linked crate and embedded-data notices ship
with the assets. The TypeScript adapter is MIT; this does not relicense assets.

From a WasmTex checkout, install Rust 1.96.0 with target
`wasm32-unknown-unknown`, `wasm-bindgen-cli` 0.2.128 and `cargo-about` 0.9.3 (with its `cli` feature).
Run `npm ci`, `npm run build:eps-converter`, `npm run test:eps-converter`,
then `npm pack --ignore-scripts ./packages/eps-converter`.
The build fetches and verifies pinned upstream source, applies patches and
fails if required notices cannot be generated. Generated binaries are not in
Git and are not included in the root WasmTex SDK archive.
