# Headless and Node integration

Use `WasmTexCompiler` when your application owns the files, editor and PDF display,
or when compiling on a server. Start with [installation](howto.md#installation) and
[engine assets](assets.md). No Monaco or PDF.js worker setup is needed for this entry.
See [compiler options and methods](compiler-api.md) for the full contract.

## Headless Compilation

Use the headless entrypoint when your app owns the editor, CRDT state, and PDF UI.

```typescript
import { WasmTexCompiler } from 'wasmtex/headless'

const compiler = new WasmTexCompiler({
  assetBaseUrl: '/', // serves /wasmtex/2025/ from the asset setup guide
  files: {
    'main.tex': '\\documentclass{article}\\begin{document}Hello\\end{document}',
  },
})

try {
  await compiler.init() // loads the engine and files; does not compile
  const result = await compiler.compile()
  if (result.success && result.pdf) {
    // Hand result.pdf to your renderer or save it as a file.
    console.log(`Compiled ${result.pdf.byteLength} PDF bytes`)
  } else {
    console.error(result.errors, result.log)
  }
} finally {
  compiler.dispose() // for an interactive editor, keep it until unmount
}
```

Interactive hosts must follow the [operation lifetime contract](compiler-api.md#headless-operation-lifetime):
serialize compile calls, await project replacement, and treat `AbortError` after
an edit or disposal as an obsolete result. Recompile after that operation settles.

If the host wants to skip a later compile after unrelated content edits, use only
the headless result's complete dependency manifest:

```ts
const result = await compiler.compile() // on a still-initialized interactive compiler
const manifest = result.telemetry?.dependencyManifest
const canReuse =
  result.success &&
  !!result.pdf &&
  manifest?.complete === true &&
  changedPaths.every((path) => !manifest.projectInputs.includes(path))
```

This check assumes the same main file, engine/options, and project topology.
Compile conservatively when the manifest is absent/incomplete or a file was
added, deleted, or renamed. The richer `telemetry.dependencies` graph is useful
for inspection, but its best-effort observations are not itself a reuse proof.

With `incremental: true`, a host that owns the editor cursor can prepare the next
pdfLaTeX checkpoint during idle time after a successful full compile:

```ts
await compiler.prepareIncrementalCompile(activeTexPath, cursorOffset)
```

The offset is UTF-16, matching browser editor offsets. The call is best-effort: it
returns `true` only when it built a new checkpoint, and leaves the current compile
result untouched. A later `compile()` waits if preparation is still finishing.

For return visits, opt into the separate durable preamble cache and bind it to the
immutable mirror revision already used by the compile profile:

```ts
const compiler = new WasmTexCompiler({
  completionProfile: {
    id: 'texlive-2025-production',
    mirrorRevision: 'sha256:immutable-catalog-revision',
  },
  incremental: true,
  persistentPreambleCache: true,
})
```

The durable cache is best-effort and browser-only: missing IndexedDB, a missing
mirror revision, a changed project preamble dependency, or invalid stored bytes all
fall back to rebuilding normally.

## Server backends (BibTeX / Biber / xindy offload)

By default every compile stage runs **client-side** (WASM/TS), so nothing leaves the
device. To offload a stage to a server that runs the same deterministic engine, pass a
`backends` registry to `WasmTexCompiler`. Stages left unregistered keep the client
default. The `.aux`-based `BIBTEX_STAGE` and `.bcf`-based `BIBER_STAGE` are distinct
contracts, so one processor can never receive the other's request.

```typescript
import { WasmTexCompiler, BackendRegistry, BIBER_STAGE, createBiberBackend } from 'wasmtex/headless'

const backends = new BackendRegistry()
// BIBER_STAGE accepts only the .bcf-based BiberRequest contract.
backends.register(BIBER_STAGE, createBiberBackend({ endpoint: '/api/biber' }))

const compiler = new WasmTexCompiler({ files, backends })
await compiler.init()
const result = await compiler.compile() // Biber runs remotely; rest stays client-side.
```

`createBiberBackend` (biblatex `.bcf` → `.bbl`), `createMakeindexBackend` and
`createXindyBackend` (`.idx` → `.ind`, stage `'index'`) are thin wrappers over
`createJsonTextBackend` / `createRemoteBackend`; roll your own server backend with those for
any stage. Wrap any string-producing backend with `withCache(backend, store)` (e.g.
`new MemoryCacheStore()`) for content-addressed reuse — a stage compiled once on any host is
then free everywhere. The toolkit is exported from both `wasmtex` and `wasmtex/headless`.
See [Bibliography backends](bibliography.md).

> The compiler auto-routes the `bibliography` **and `index`** stages. `\printindex` works
> out of the box, fully client-side, via the bundled makeindex WASM — no server needed. A
> backend registered for `index` (`createMakeindexBackend`, or `createXindyBackend` for
> multilingual / complex indexing) offloads that stage to your endpoint instead. The
> [execution model](execution-model.md#pluggable-stages-available-today) explains how to choose the boundary.

## Server-side compilation (Node)

Requires Node 24+ and curl for synchronous worker package lookups, plus the
local engine asset tree. This adapter still uses the released Emscripten JS glue
and MEMFS; see the [execution model](execution-model.md#supported-hosts).

The `wasmtex/node` entry runs the same engines off-browser via a `worker_threads`
host. Call `installNodeWorkerHost` once (pointing at your local engine assets), then use
`WasmTexCompiler` exactly as in the browser. pdfLaTeX, LuaLaTeX, **and XeLaTeX** all run
under Node.

Keep the installation handle and release it after all its compilers. A second active
Node installation throws; dispose the first before changing asset roots. Repeated
disposal is safe. The [API contract](compiler-api.md#node-host-installation) defines restoration
when another owner has replaced a global.

```typescript
import { installNodeWorkerHost, WasmTexCompiler } from 'wasmtex/node'

const nodeHost = installNodeWorkerHost({
  publicDir: '/path/to/public',                  // holds versioned controller/core/WASM assets
  assetBaseUrl: 'http://assets.local/',
})

const compiler = new WasmTexCompiler({
  assetBaseUrl: 'http://assets.local/',
  texliveUrl: 'https://texlive.example/immutable/2025/', // packages (pass-through fetch)
  files: { 'main.tex': '\\documentclass{article}\\begin{document}Hello\\end{document}' },
})
try {
  await compiler.init()
  const result = await compiler.compile()
  if (!result.success) console.error(result.errors, result.log)
  // Save result.pdf when present.
} finally {
  compiler.dispose()
  nodeHost.dispose() // restore globals after terminating compiler workers
}
```

`publicDir` must contain `wasmtex/2025/` with the complete verified asset set.
Use the [download procedure](assets.md#download-a-verified-set) before running this recipe.

## Engine selection (XeLaTeX / CJK)

WasmTex auto-detects the TeX engine each document needs. You usually do nothing — a
doc that uses `fontspec`, `unicode-math`, or CJK (`xeCJK`, `xetexko`) is detected and
routed to **XeLaTeX**, a `\directlua`/`luacode`/`luaotfload` doc to **LuaLaTeX**, and
everything else to **pdfLaTeX**. You can also force it with a `% !TEX program = …`
magic comment or the `engine` option.

> **Where the Unicode engines run.** The browser **`WasmTex` UI component runs
> pdfLaTeX only.** A document that needs XeLaTeX/LuaLaTeX compiles to an *actionable*
> error there ("this document requires XeLaTeX …") rather than failing cryptically.
> The **headless `WasmTexCompiler`** (and the Node host, see [Server-side
> compilation (Node)](#server-side-compilation-node)) does run XeLaTeX/LuaLaTeX when
> the matching engine WASM is present in its assets dir — so by-name CJK fonts and
> `\directlua` work there.

```typescript
// Auto (default): detected from the main file's preamble / magic comment.
new WasmTex('#editor', '#preview', { files, engine: 'auto' })

// Force a specific engine. (XeLaTeX/LuaLaTeX actually compile under the headless
// compiler; the browser WasmTex component is pdfLaTeX-only.)
new WasmTexCompiler({ files, engine: 'xelatex' })
```

A Korean document, for example, compiles under the headless compiler (or Node host):

```latex
\documentclass{article}
\usepackage{xeCJK}
\setCJKmainfont{Harano Aji Gothic}   % by family name, or a filename like
                                     % HaranoAjiGothic-Regular.otf
\begin{document}
안녕하세요. XeLaTeX + xeCJK 한국어 문서.
\end{document}
```

Fonts must be available from the selected mirror or supplied as project files.
Both name and filename lookup work with the released font databases; project-local
fonts should use explicit filenames/paths. See [asset and mirror configuration](assets.md#configure-the-host).

A LuaLaTeX document is detected the same way — a `\directlua`, a `luacode`/`luaotfload`
package, or `% !TEX program = lualatex` selects **LuaLaTeX** (again, under the headless
compiler / Node host):

```latex
% !TEX program = lualatex
\documentclass{article}
\usepackage{fontspec}
\setmainfont{lmroman10-regular.otf}   % by filename (or stem: lmroman10-regular)
\begin{document}
LuaLaTeX with \directlua{tex.print("inline Lua")}.
\end{document}
```

> **LuaLaTeX supports font names and filenames.** Released mirrors provide the
> matching `luaotfload-names.lua` database, so `\setmainfont{Latin Modern Roman}`
> works as well as `\setmainfont{lmroman10-regular.otf}`. A custom mirror needs
> the matching database and fonts. For a project-local font, include the font
> bytes in `files` and use its filename/path; host operating-system fonts are
> not automatically visible to the worker.

> **Engine assets.** Each Unicode engine loads from your assets dir
> (`wasmtex/<version>/`), next to the pdfTeX engine: XeLaTeX needs
> `wasmtex-xetex` + `wasmtex-dvipdfm`; LuaLaTeX needs `wasmtex-luatex` (it
> writes PDF directly, so it's a single worker — no dvipdfmx). The standalone IDE /
> GitHub Pages build ships whatever is available automatically (CI). If you self-host,
> the [asset download procedure](assets.md#download-a-verified-set) includes the Unicode engines too.
> **If an engine's WASM is
> absent, a document that needs it compiles to an actionable error** ("this document
> requires XeLaTeX/LuaLaTeX …") instead of failing cryptically — so pdfLaTeX-only
> deployments degrade gracefully. Both XeLaTeX and LuaLaTeX (LuaHBTeX) are built from
> source and ship via CI; the
> [multi-engine support guide](engine.md#multi-engine-support-xelatex--lualatex) covers their build and routing details.

## Preparing transport for the selected engine

The headless compiler owns engine detection. A host can observe its actual selection
without repeating magic-comment or package rules:

```ts
const compiler = new WasmTexCompiler({
  files: { "main.tex": source },
  engine: "auto",
  onEngineSelected: ({ engine }) => {
    // Cancel prior optional preparation, then start transport for this engine.
    // Do not await it or change compiler inputs from this observer.
    prepareTransport(engine)
  },
})
```

The callback runs after engine options are fixed and before engine initialization,
once on initial selection and again when the engine kind changes. It reports an
attempt, not successful readiness. Promises do not block initialization; synchronous
and asynchronous failures are logged without changing compile results. The host owns
cancellation on engine transitions and disposal. HTTP preparation must preserve engine
file materialization and lookup transitions, as required by the [optimization policy](engine-optimization-policy.md#sdk-preparation-is-part-of-compatibility).
