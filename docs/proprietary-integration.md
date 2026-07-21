# Proprietary Integration

An application may use the currently MIT-licensed WasmTex host SDK while keeping its
own source repository, server code, product UI, collaboration logic, and business
logic private. MIT is the current license decision because Cortex directly bundles
host SDK APIs; it is not a requirement that WasmTex must always use MIT. This model
depends on preserving a real boundary between the application and the separately
licensed TeX engine distribution.

This document is a technical licensing guide, not legal advice.

## Recommended boundary

Keep the following as separate distribution units:

1. **Proprietary application** — imports the `wasmtex` or `wasmtex/headless` SDK,
   owns product state and UI, and is distributed under the application owner's terms.
2. **WasmTex SDK** — MIT files from the package's declared `files` list, accompanied
   by the WasmTex MIT notice and applicable third-party notices.
3. **Engine release** — versioned worker/controller, generated JavaScript, WASM, and
   formats at a replaceable asset URL. This unit carries GPL, LPPL, LGPL, permissive,
   and component-specific terms and has its own corresponding-source download.
4. **TeX Live/ICU mirror** — versioned data with per-file provenance, notices, and
   corresponding source where required.

The application should communicate with engines through WasmTex's existing
file/command/result worker protocol. Do not import a generated GPL engine module into
the application's main bundle, copy engine implementation code into application
modules, or exchange engine-internal structures through a custom intimate API.

Separate hostnames are not legally required, but separate URLs, manifests, release
versions, and build jobs make the boundary easier to demonstrate and audit. A useful
layout is:

```text
app.example.com/assets/app-<hash>.js                 proprietary application
assets.example.com/wasmtex/2025/<build>/...          engine distribution
assets.example.com/wasmtex/2025/<build>/SOURCE...    corresponding source
assets.example.com/texlive/2025/...                  TeX Live/ICU mirror
```

## What remains private

With that boundary, the following application material does not need to be published
merely because the product uses WasmTex:

- application and server source code;
- collaboration, authentication, billing, AI, and storage implementations;
- product-specific React components, CSS, prompts, and configuration;
- user documents and PDFs produced by an ordinary TeX compilation; and
- private modifications to MIT-only WasmTex SDK code, unless another agreement says
  otherwise.

The browser necessarily receives the application's client JavaScript, even if its
source repository and preferred source form remain private.

## What must be available to recipients

When a browser receives a GPL-covered engine binary, publish the exact engine
release's license notices and complete corresponding source. That source includes
the engine sources, the controller/glue that forms the distributed engine unit,
local modifications, interface definitions, and the scripts and configuration used
to build it. It does not include unrelated proprietary application code when the
boundary above is preserved.

The product's terms of service or EULA must carve out open-source components and must
not impose an NDA, reverse-engineering ban, or other additional restriction on the
recipient's GPL rights in the engine copy.

Expose a durable **Open-source licenses and source code** link in the product UI. It
should point to the notice, exact engine manifest, and corresponding-source archive
for the asset version currently loaded by the browser.

## Server-only alternative

For the lowest client-distribution burden, run the TeX engines only on the service's
own servers and send source documents in and PDF/log/SyncTeX results out. Do not send
the engine JavaScript, WASM, formats, or TeX Live runtime files to the browser.

GPLv2 does not contain the AGPL network-source clause, so private server operation by
itself does not require publishing the application or server source. If the service
later distributes a container, appliance, desktop build, or on-premises deployment,
the distribution obligations apply to the engine copies in that product.

Server-only operation does not cure a missing redistribution permission in a
dependency. Never distribute a legacy `pplib`-linked LuaHBTeX or XeTeX artifact.
New WTPDF/Xpdf builds remove that dependency but must still satisfy their GPL,
corresponding-source, notice, provenance, and compatibility gates. Obtain legal
review before a commercial launch.

## Product release checklist

- Pin the WasmTex SDK and engine release independently.
- Keep engine files out of the proprietary application bundle.
- Publish complete corresponding source for the exact engine bytes.
- Publish all engine, format, package, data, and font notices.
- Preserve TeX Live mirror provenance instead of retaining only flattened filenames.
- Link the loaded asset version to its notice and source from the product UI.
- Exempt open-source components from conflicting product terms.
- Re-run the audit whenever TeX Live, Emscripten, ICU, ports, or engine glue changes.
