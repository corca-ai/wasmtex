# Compiler API

Reference for `wasmtex/headless` and the compiler re-exported by `wasmtex/node`.
Start with [headless and Node integration](headless.md). The browser component
has a separate [editor API](api.md#constructor).

Use [options](#wasmtexcompileroptions) to configure a session, [methods](#wasmtexcompiler-methods)
to manage it, and [telemetry](#compile-telemetry) to inspect results. Optional features
are [incremental compilation](#incremental-compilation), [tagged export](#accessible-export-tagged-pdf--pdf-ua)
and [TikZ externalization](#tikz-figure-externalization).

## Node host installation

`installNodeWorkerHost(options)` from `wasmtex/node` installs an engine worker factory
and a local-asset `fetch` shim. Only one Node host may be active in an SDK module
instance. A second installation throws before modifying either global, including when
its options match the active host. Failed setup releases the installation reservation.

Dispose every compiler using the host before calling its handle's `dispose()`.
Disposal is idempotent and permits a fresh installation; reusing an older disposed
handle cannot tear down the new host. The handle restores the preceding fetch only
if its own shim still owns `globalThis.fetch`, and removes only its worker registration.
An independently installed replacement is preserved. Separate copies of the SDK in
one Node realm do not coordinate these globals; use one SDK/host installation per realm.
See the [Node recipe](headless.md#server-side-compilation-node).

## Headless Compiler

Use `wasmtex/headless` when your app owns the editor, collaboration layer, and PDF rendering.

```ts
import { WasmTexCompiler } from 'wasmtex/headless'

const compiler = new WasmTexCompiler({
  assetBaseUrl: 'https://cdn.example.com/',
  files: {
    'main.tex': '\\documentclass{article}\\begin{document}Hi\\end{document}',
  },
})

await compiler.init()
const result = await compiler.compile()
```

### `WasmTexCompilerOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `files` | `Record<string, string \| Uint8Array>` | `{}` | Initial project files. |
| `mainFile` | `string` | `'main.tex'` | Main TeX file. |
| `engine` | `'auto' \| 'pdflatex' \| 'xelatex' \| 'lualatex'` | `'auto'` | TeX engine; `'auto'` detects from the main file. See [Multi-engine support](engine.md#multi-engine-support-xelatex--lualatex). |
| `texliveVersion` | `'2025' \| '2026'` | `'2025'` | Exact TeX Live engine/assets year; keep it aligned with the selected mirror profile. |
| `texliveUrl` | `string` | Immutable R2 snapshot for the selected year | TeX Live package endpoint. |
| `assetBaseUrl` | `string` | `'/'` | Base URL for WasmTex WASM assets (`wasmtex/...`). |
| `skipFormatPreload` | `boolean` | `false` | Skip `.fmt` preload during engine bootstrap. |
| `disablePreambleSnapshot` | `boolean` | `false` | Disable [precompiled preamble snapshots](engine.md#preamble-snapshots) and always run a full compile. |
| `persistentCache` | `boolean` | `false` | Enable the [built-in persistent cache](engine.md#persistent-cache) (IndexedDB) of fetched TeX Live assets. No-ops without IndexedDB. |
| `persistentPreambleCache` | `boolean` | `false` | Persist [pdfLaTeX preamble snapshots](engine.md#durable-preamble-snapshots) across compiler sessions. Requires an immutable `completionProfile.mirrorRevision` and IndexedDB. |
| `warmupCache` | `WarmupCache` | - | Pre-fetched TeX Live files from `warmup()`. |
| `onEngineSelected` | `(selection: Readonly<EngineDetection>) => void \| Promise<void>` | - | Headless compiler notification before initialization of each newly selected engine, including Auto changes. Contains `engine`, `reason`, and `forced`. Returned promises are not awaited; observer failures are logged without failing compilation. Same-engine edits do not notify again. |
| `onLoadProgress` | `(event: LoadProgressEvent) => void` | - | Load progress for a host UI: `{ phase: 'format', percent }` while the precompiled format downloads, `{ phase: 'file', file, count }` for every TeX Live file fetched on demand. Pair with `warmup({ onProgress })` for the prefetch phase. |
| `incremental` | `boolean` | `false` | Enable [incremental compilation](#incremental-compilation) via mid-document checkpoints (pdfLaTeX only); in a browser this loads the checkpoint engine for [heap checkpoints](#heap-checkpoints-arbitrary-line-incremental-compilation). |
| `tikzExternalization` | `{ mode?: 'document' \| 'auto' \| 'off'; workers?: number }` | `{ mode: 'document' }` | [TikZ figure externalization](#tikz-figure-externalization): render `\tikzexternalize`d pictures on a pool of sibling compilers and reuse them across edits. |
| `completionProfile` | `{ id: string; mirrorRevision: string \| null }` | derived | Stable compile-profile identity for runtime completion snapshots. Bind an immutable mirror revision when available. |
| `backends` | `BackendRegistry` | - | Per-stage backend registry. Every stage defaults to client/local (nothing leaves the device); register a **server** backend for a stage to offload it. The headless compiler routes `BIBTEX_STAGE`, `BIBER_STAGE`, and `INDEX_STAGE`; engine-pass and export stages are not built-in routes. See [Server backends](#server-backends). |

#### Server backends

`backends` lets a headless/server integrator move a compile stage off the
device. Construct a [`BackendRegistry`](api.md#per-stage-backends) and register a
**server** backend for a stage — the default for every unregistered stage stays
client/local. Classic BibTeX uses `BIBTEX_STAGE` with `BibliographyStageRequest`
(`{ aux, bibFiles }`); Biber uses `BIBER_STAGE` with `BiberRequest`
(`{ bcf, bibFiles }`). These contracts cannot be registered in each other's slots.

```ts
import { WasmTexCompiler, BackendRegistry, BIBER_STAGE, createBiberBackend } from 'wasmtex/headless'

const backends = new BackendRegistry()
backends.register(BIBER_STAGE, createBiberBackend({ endpoint: 'https://my-host/biber' }))

const compiler = new WasmTexCompiler({ files, backends })
await compiler.init()
await compiler.compile() // Biber runs on your endpoint; client biblatex-lite is skipped
```

`createBiberBackend` (biblatex/Biber → `.bbl`), `createMakeindexBackend` and
`createXindyBackend` (the `index` stage, `.idx` → `.ind`) build server backends
over the same endpoint contract; `createRemoteBackend` / `createJsonTextBackend`
build one for any custom stage. Wrap any backend with `withCache` for the shared
content-addressed cache.

> **Wired today:** the compiler auto-routes the `bibliography` and `index` stages.
> `\printindex` runs client-side via the bundled makeindex WASM by default; a backend
> registered for `index` (`createMakeindexBackend` / `createXindyBackend`) offloads it.
> See the [execution model](execution-model.md#pluggable-stages-available-today).

#### Incremental compilation

With `incremental: true`, a body edit **after a page break** (`\clearpage`/`\newpage`) re-typesets only the *tail* of the document — booting the engine from a cached checkpoint at the latest page break before the change and splicing the new tail pages onto a cached head PDF. Latency depends on the document and checkpoint state; measure preparation and full/resumed compiles separately.

Headless hosts that know the active cursor can move the first checkpoint-build cost to idle
time. After a stabilized full compile and before the next edit, call
`await compiler.prepareIncrementalCompile(activePath, offset)`. `offset` is a UTF-16 offset
in that file; an included-file path warms the boundary before its `\include`/`\input` in the
main document. This is best-effort and returns `false` when no safe boundary exists or the
checkpoint is already warm.

- **pdfLaTeX only** — XeLaTeX/LuaLaTeX always do a full compile.
- **Optional peer dependency**: splicing uses [`pdf-lib`](https://www.npmjs.com/package/pdf-lib). If it isn't installed, incremental silently falls back to a full compile.
- **Automatic fallback** to a full compile when the preamble changed, there's no page break before the edit, or the edit touches labels/sectioning (so cross-references stay correct — LaTeX's usual two-pass reconcile still applies).
- Transparent: `compile()` returns the same `CompileResult` shape; no API change beyond the option. A fast-path result carries `synctex: null` (the tail compiles in isolation) but sets **`synctexData`** to the tail SyncTeX spliced onto the last full compile's head — exact for the spliced PDF. Prefer the merged data, then asynchronously parse raw bytes when present; see the [SyncTeX recipe](synctex-api.md). Multi-file `\include` documents are supported — each chapter is spliced at its own file-relative lines; `synctexData` is null (reuse the last full SyncTeX) only when the head changed since the last full compile or none was recorded.

The **editor** `WasmTex({ incremental: true })` wires this into the interactive loop: a
servable edit renders its checkpoint splice immediately as a **fast paint**. The tail's SyncTeX is
**spliced** onto the last full compile's head (page + source-line + input-tag offsets), so the fast
paint carries **exact** SyncTeX — click-to-source works immediately and, because the edit is `final`
(cross-references unchanged) and the head is unchanged, **no background reconcile is needed** (a real
throughput win, not just latency hiding). The `status` event carries `incremental: true` on such a
fast paint. It also **speculatively pre-builds** the checkpoint near the cursor while the loop is idle,
so the first edit is fast too. Same fallbacks as above; label/citation edits skip the fast paint and go
straight to a full compile (no stale-reference flash). The SyncTeX splice covers both single-file and
multi-file documents — `\include`/`\input` chapters splice at their own file-relative lines; only a head
that changed since the last full compile falls back to a background full reconcile that refreshes SyncTeX.

#### Heap checkpoints (arbitrary-line incremental compilation)

With `incremental: true` in a browser, the headless compiler loads the **checkpoint
engine** (`wasmtex-pdftex-checkpoint.*`, the same pdfTeX instrumented with Binaryen's
Asyncify) and the page-break checkpoints above are superseded by **heap checkpoints**
(#81): a compile can be suspended before TeX reads a chosen line of the main file and its
entire state — a sparse copy of wasm memory plus the worker's file state — kept as a
checkpoint. An edit that leaves everything before that line unchanged *resumes* the
suspended run: TeX typesets only the rest of the document and writes the complete PDF and
SyncTeX itself (nothing is spliced, `pdf-lib` is not needed). A checkpoint is restored by a
memory copy, so it serves any number of edits after it.

- **Placement**: every full compile takes a checkpoint at the paragraph boundary before the
  region the last edit touched (edits cluster), and `prepareIncrementalCompile(path, offset)`
  takes one before the cursor's paragraph during idle time. Up to 4 are kept (LRU, ~35–80 MB
  each as sparse images) and freed with the compiler.
- **Validity**: the main-file bytes before the checkpoint line, and every project file TeX had
  opened by then (from the run's recorder), must be unchanged. Preamble edits, edits before
  the earliest checkpoint, and label/citation/numbering edits take the full path (the latter
  because a resumed run reads cross-references from the `.aux` the original run loaded).
- **Result**: a resumed compile is an ordinary `CompileResult` with `phaseTimings.checkpointResume`
  set; `result.heapCheckpoints` lists the checkpoints a compile took.
- **Cost**: the Asyncify build adds code and full-compile overhead. The headless
  compiler selects it only with `incremental: true` in browser workers; Node keeps
  the plain build and page-break path. Measure checkpoint preparation, resumed
  edits and total latency separately with the [development probes](engine-testing.md#engine-cpu-diagnostics).

#### Accessible export (tagged PDF / PDF-UA)

`compiler.exportAccessiblePdf(options?)` compiles the project as a tagged, PDF/UA-declared
PDF on a sibling compiler, leaving the interactive `compile()` path and its engine untouched.
Nothing is reimplemented: the main file gets the LaTeX kernel's own switch,
`\DocumentMetadata{lang=…, pdfversion=2.0, pdfstandard=ua-2, tagging=on}`, in front of
`\documentclass` (on the same line, so no line number moves), unless it already declares its
own `\DocumentMetadata`, which is then trusted as written.

```ts
const out = await compiler.exportAccessiblePdf({ lang: 'ko-KR' }) // lang/standard optional
out.result.pdf        // the tagged PDF (a CompileResult: log, errors, …)
out.declaration       // { lang, standard: 'ua-2' | 'ua-1', injected }
out.documentClass     // 'article' …
out.classSupport      // 'supported' | 'partial' | 'unsupported' | 'unknown'
out.kernelSupported   // false on the TeX Live 2025 profile (kernel predates tagging=on)
out.tagging           // read back from the PDF: { tagged, lang, uaPart, figures, figuresWithAlt, headings, tables, title }
out.notes             // human-readable caveats for the host to show
```

- **Engine requirement**: the tagging kernel ships with LaTeX 2025-06, i.e. the **TeX Live
  2026** profile. On 2025 the compile still runs but `kernelSupported` is false and the notes
  say so.
- **Language**: detected from `\hypersetup{pdflang=…}`, `\DocumentMetadata{lang=…}`, babel
  (`main=` or the last option), polyglossia `\setmainlanguage`, or kotex; `en-US` otherwise.
  Pass `lang` to override.
- **Classes**: `classSupport` comes from a verified matrix (TeX Live 2026, veraPDF PDF/UA-2):
  `supported` — the standard classes, amsart and KOMA-Script (which prints "Activated tagging
  detected but not supported!" and still produces a clean structure tree); `partial` —
  llncs, IEEEtran, elsarticle (structure tree, but tagging errors in the log; check the
  output); `unsupported` — memoir, acmart, revtex, beamer (structure violations or
  failed compiles). Unknown classes are attempted and reported. Every class, even
  `article`, currently fails veraPDF clause 8.2.2 on a few rules (tabular `\hline`, the
  footnote rule) the kernel does not yet mark as artifacts — that is the kernel's baseline,
  not something the export can fix.
- **Alt text**: `\includegraphics[alt={…}]{…}` becomes the figure's `/Alt`; a missing one is a
  tagpdf error in the log and shows up in `tagging.figuresWithAlt` and the notes. The linter's
  `a11y-graphics-alt`, `a11y-float-caption`, `a11y-heading-skip` and `a11y-pdf-metadata` rules
  point at the sources of these gaps before export (info severity by default).
- **Cost**: the sibling owns a separate engine and preamble state. Measure tagged
  export separately from interactive preview; no fixed slowdown is guaranteed.

The export module and the TikZ figure-worker pool are loaded on first use (dynamic
imports), so a host's startup bundle carries only the headless compiler itself.

`inspectPdfTagging(pdf)` (exported) produces the `tagging` report for any PDF bytes — it
inflates object streams itself, so hosts need no PDF library for an accessibility summary.

#### TikZ figure externalization

`tikzExternalization` (default `{ mode: 'document' }`) makes the TikZ/pgfplots
[`external` library](https://tikz.dev/library-external) work without shell escape. A document
that calls `\tikzexternalize` normally needs `pdflatex -shell-escape` to spawn one pdflatex per
picture; in the browser that `system()` call fails, every picture logs a shell-escape error and
is typeset inline again on each compile. With externalization on, the headless compiler drives
the library itself, so the document's own `\tikzexternalize` (and its `prefix=`,
`\tikzsetnextfilename`, `\tikzexternaldisable`, …) behave as documented upstream:

1. The main job runs in the library's `mode=list and make`: it writes the figure list, includes
   every figure whose PDF exists, and keeps the library's own MD5 of each picture in
   `<figure>.md5`.
2. Each figure that is missing or whose MD5 changed is rendered by a **figure job** — a compile
   of the same document on a sibling `WasmTexCompiler` with the library's grab mode selecting
   that picture (the other pictures are skipped by the library's `optimize` path). The sibling
   keeps its own preamble snapshot, so a figure job costs about the picture alone. Up to
   `workers` figure jobs run concurrently (default `min(3, hardwareConcurrency - 1)`); each
   worker is a full engine (one more worker heap per figure worker).
3. The figure PDFs (and `.dpth` baseline files) are written into the main engine and the main
   job runs once more. The pool is created on first use and disposed with the compiler.

`mode: 'auto'` additionally externalizes documents that load `tikz`/`pgfplots` but never call
`\tikzexternalize`, by activating the library at the end of the preamble (same line as
`\begin{document}`, so no line number moves). Its contract is *never worse than inline*:

- Documents the library cannot externalize faithfully stay inline and say why in
  `telemetry.tikzExternalization.blocked`: `beamer` (overlay steps inside pictures),
  `remember-picture` (page-anchored/overlay pictures, `current page`, `\tikzmark`),
  `wrapped-environment` (a `tikzpicture` hidden inside a user-defined environment or
  command, which the library's picture skipping cannot see), and `too-few-pictures` (fewer
  than 3 pictures — a figure worker's own preamble snapshot would cost more than they save;
  counted statically across the project's `.tex` files, and for documents that build pictures
  in loops, by the first compile's figure list, which then redoes that one compile inline).
- If a figure job ever fails, the compile is redone inline, `fallback: true` is reported, and
  auto stays off for the rest of the compiler session.
- `\ref`/`\pageref` inside pictures resolve: the main job's `.aux` is handed to the figure
  workers under the real job's name, as the library expects. `\label` inside pictures travels
  through the library's `.dpth` files.
- A broken picture does not fail its figure job (TeX ships the page anyway), so errors found in
  figure logs are merged into `result.errors` at their source lines on every compile until the
  picture changes; `pictureErrors` counts them.

`mode: 'off'` leaves every document exactly as today. A main file can override the host's
mode with a magic comment next to `% !TEX program`:

```latex
% !WASMTEX tikz-externalization = off
```

(`off`, `document`, or `auto`), so a host that defaults to `'auto'` needs no setting of its
own for the one project that wants out, and the choice travels with the project.

`result.telemetry.tikzExternalization` reports `{ mode, figures, compiled, reused, failed,
workers, figureTimeMs, pictureErrors, fallback?, blocked? }` for the compile; a failed figure
job appends its log tail to `result.log`. Figure workers are released after five idle minutes
(rendered figures stay cached); the default worker count is `min(3, hardwareConcurrency - 1)`,
or 1 when `navigator.deviceMemory` reports 4 GiB or less.

Measure cold figure generation, unchanged recompiles and picture edits separately.
A figure pool retains additional engine heaps; reuse benefit depends on the document.
See [engine profiling](engine-testing.md) for controlled measurement procedures.

### `WasmTexCompiler` Methods

- `init(): Promise<void>` — initializes the selected engine and synchronizes files; does not compile.
- `compile(): Promise<CompileResult>` — compiles and settles supported reruns/auxiliary stages; inspect `success`, `errors` and `pdf`.
- `exportAccessiblePdf(options?: AccessibleExportOptions): Promise<AccessibleExportResult>` — see [tagged export](#accessible-export-tagged-pdf--pdf-ua).
- `prepareIncrementalCompile(path?: string, offset?: number): Promise<boolean>` — with
  `incremental: true`, build an eligible pdfLaTeX checkpoint while idle. Defaults to the end
  of the main file. A `compile()` waits for an in-flight preparation; preparation returns
  `false` while a compile or unsynchronized project edit is active.
- `setFile(path, content): void`
- `loadProject(files): Promise<void>`
- `getFile(path): string | Uint8Array | null`
- `listFiles(): string[]`
- `getMainFile(): string`
- `setMainFile(path): void`
- `getProjectIndex(): ProjectIndex` — escape hatch to the shared symbol index (labels, citations, commands) for host-built tooling.
- `getCompletionSnapshotState(): CompletionSnapshotState` — `absent`, `fresh`, or `stale`; any project edit stales runtime evidence until a matching full compile.
- `readOutput(path): Promise<string | null>` — reads generated files such as `main.log`, `main.aux`, or `main.bbl`.
- `flushCache(): Promise<void>`
- `clearCache(): Promise<void>` — clears the [persistent TeX Live cache](engine.md#persistent-cache) (IndexedDB) for the active TeX Live mirror namespace; use `clearTexliveCache({ version })` to clear every mirror for a year.
- `dispose(): void`

### Result types

The return type of `compile()` is `CompileResult`. For an explicit annotation,
use `import type { CompileResult } from 'wasmtex'` (erased at runtime), or derive
`Awaited<ReturnType<WasmTexCompiler['compile']>>`. The headless entry does not
re-export the `CompileResult` name. Use [SyncTeX parsing](synctex-api.md) when
rendering the returned PDF in your own viewer.

### Headless operation lifetime

One main-engine operation runs at a time. Overlapping `compile()` calls reject
with an `Error` containing `in progress`; they are not queued or merged. The
first compile reserves its place while waiting for an existing incremental
preparation. Preparations share an in-flight task and return `false` while a
compile owns or is waiting for the worker. Concurrent `init()` calls share
initialization. An input edit during `init()` also rejects initialization with
`AbortError`; retry `init()` with the current inputs.

`setFile()` remains synchronous and allowed during compilation or preparation.
A file write, a changed `setMainFile()`, `loadProject()`, or `dispose()` invalidates
that run: its promise rejects with `AbortError`, and late engine/backend results
cannot publish output, auxiliary files, dependency manifests, completion evidence,
or checkpoints for the new inputs. Reasserting the same main file is a no-op.
The last completed index can retain historical evidence; runtime completion
state becomes stale until a matching full compile. Handle `AbortError` as an
obsolete run and compile again after its promise settles.

`loadProject()` cancels and waits for the previous operation before replacing
files. Await it before another project load, file/root write, or compile; those
calls reject while replacement is pending. `readOutput()`, `flushCache()`, and
`clearCache()` also reject if another main-engine operation owns the worker.
`flushCache()` marks project files for resynchronization and clears checkpoints.

Cancellation retires the affected workers and their checkpoints. The next
compile initializes fresh workers and resends the current files, so it can cost
more than an uninterrupted warm compile. Remote backend work may continue on its
server, but its late response is ignored. `dispose()` additionally requires a new
`init()` before compiling again. These rules describe `WasmTexCompiler`; the UI
component has its own compile scheduler.

### Compile phase timings

pdfLaTeX engine results may expose `CompileResult.phaseTimings`. These worker-side
durations separate the costs hidden inside the host-visible `compileTime`:

| Field | Description |
|-------|-------------|
| `workerTotalMs` | Total time in the worker compile routine. |
| `heapRestoreMs` | Time spent restoring the reusable WASM initialization heap. |
| `heapSnapshotMs` | One-time time spent capturing that pristine initialization heap. |
| `heapSnapshotBytes` | Bytes retained by the initialization snapshot. |
| `heapSizeBytes` | Current grow-only WASM heap size after the compile. |
| `preambleBuildMs` | Time spent building a document-specific preamble format; zero on a snapshot hit. |
| `formatInstallMs` | Time spent installing the selected format in the worker filesystem. |
| `preambleExportMs` | Time spent copying a rebuilt format for durable persistence. |
| `postProcessMs` | Time spent extracting PDF/SyncTeX, recorder data, and runtime observations. |
| `texRunMs` | Time spent in the TeX entry point, including a correctness fallback when required. |

Treat absent timings as an older or non-pdfLaTeX engine rather than synthesizing
zeros. The performance benchmark prints both compile passes' phase timings and can
exercise a staged engine build with `WASMTEX_PUBLIC_DIR=/path/to/public`.

### Compile telemetry

`CompileResult.telemetry` is a machine-readable description of a compile — branch on stable fields instead of scraping the log. It's headless **data only**; the host decides how to surface it (problem panel, preview overlay, cache layer). The legacy `errors` / `glyphCoverage` fields remain for back-compat; telemetry is their superset.

```ts
const { telemetry } = await compiler.compile()
```

| Field | Type | Description |
|-------|------|-------------|
| `diagnostics` | `Diagnostic[]` | Every error/warning with a stable `code` (`tex-error`, `package-error`, `missing-package`, `font-not-found`, `missing-glyph`, `undefined-reference`, `undefined-citation`, `rerun-needed`, `overfull-box`, `package-warning`, `latex-warning`), `severity`, `message`, and optional `file`/`line`. A `missing-glyph` entry carries the affected font + characters in `glyph`. |
| `resolver` | `ResolverEvidenceReport` | Bounded, profile-bound evidence for TeX Live lookups. Each entry identifies the engine stage, requested name, kpathsea format, final outcome (`resolved`, `mirror-absent`, or `transport-error`), and the cache/bloom/network attempts that led to it. `dropped` and `complete` describe the 1024-entry retention bound. |
| `texliveDependencies` | `TexliveDependencySet` | The exact TeX Live dependency set of the session so far — the union, across rerun passes and across every compile since `init()`, of every resource the TeX passes resolved (`files`, each with the kpathsea request `filename` and, when it differs, the mirror `candidate`) or found absent (`notFound`). Names only, bound to `texliveVersion` and `profile`; `complete` is false when a retention bound dropped entries. Replay it through [`warmup({ dependencies })`](warmup.md#exact-dependency-prefetch-dependencies) next session. |
| `tikzExternalization` | `TikzExternalizationTelemetry` | Figure externalization outcome: `{ mode, figures, compiled, reused, failed, workers, figureTimeMs, pictureErrors, fallback?, blocked? }`. See [TikZ figure externalization](#tikz-figure-externalization). |
| `geometry` | `DocumentGeometry` | Page/box geometry parsed from the XDV — per page: `width`/`height` (media box, bp), `textRuns` (positioned runs with `x`/`y`/`width`/`size`/`glyphs`, plus `text`/`font` when available), `rules`, and a `contentBox`. The substrate for text extraction, click-to-source, cropping, and overlays. **XeLaTeX only** (the engine that emits XDV); `reliable: false` flags an unparseable/desynced run. |
| `dependencies` | `DependencyGraph` | What the compile depended on: `nodes` (each with `kind: 'tex' \| 'class' \| 'package' \| 'font' \| 'image' \| 'bib' \| 'other'`, `origin: 'project' \| 'system'`, and `discoveredBy`) + `edges` (`includes`/`loads`/`uses-font`/`reads`) + `root`. Rich tooling data derived from the log and enriched with source declarations, XDV fonts, and each TeX engine's `.fls` recorder. It remains useful when observations are incomplete, so do not treat the graph alone as a safe invalidation proof. |
| `dependencyManifest` | `DependencyManifest` | Versioned, normalized project-input boundary produced by `WasmTexCompiler`. `projectInputs` includes arbitrary project files read by the engine plus the inputs forwarded to bibliography/index stages. `complete: true` is a correctness guarantee, not a confidence score. `coverage` identifies the contributing stages/signals; `incompleteReason` explains why a host must compile conservatively. |
| `completionSnapshot` | `CompletionSnapshot` | Versioned, bounded runtime evidence produced only as a by-product of this full compile. Its identity binds the project revision, root, engine, TeX Live year, and mirror/profile. Fields independently report `observed`/`unsupported`, `complete`, and truncation. |

Coordinates are PDF points (bp) measured from each page's top-left. Geometry text and dependency fonts are best-effort — XeTeX emits run text only for some runs, and font edges come from the XeLaTeX XDV.

Resolver evidence is delivered only in the returned result; wasmtex does not send it
to an analytics service. Cache hits distinguish warmup, persistent, and current-session
state. Negative hits distinguish warmup/durable state from an immutable-mirror response,
while a request that received no mirror response is `transport-error` and is not added to
the negative cache. Candidate values are filenames, never URLs. Hosts should classify
user-facing problems from these stable fields and the attached `profile`, not console text.

#### Safe host-side invalidation

Only the manifest from the current successful rendered result can justify reusing
that result. The host must also know that the compile profile and root are unchanged,
and should conservatively compile on project topology changes (add/delete/rename):

```ts
const result = await compiler.compile()
const manifest = result.telemetry?.dependencyManifest

const mayReuseAfterContentChanges =
  result.success &&
  !!result.pdf &&
  manifest?.complete === true &&
  changedPaths.every((path) => !manifest.projectInputs.includes(path))
```

pdfLaTeX and LuaLaTeX full compiles use recorder-backed manifests. XeLaTeX records
its TeX inputs, but its separate dvipdfmx conversion stage does not yet expose an
authoritative project-input list, so the combined manifest remains incomplete.
Incremental checkpoint results are also explicitly incomplete until tail recorder
observations can be soundly combined with the unchanged head. Failed or partial
results never carry `complete: true`.

The bibliography coverage follows the actual stage request: because the current
compiler forwards every project `.bib`, every one is listed, along with a selected
project-local `.bst`. Generated `.bbl`/`.ind` files and engine scratch files are
excluded from `projectInputs`.
