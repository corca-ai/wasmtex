# Language service API

Public contracts for `wasmtex/lsp`, `wasmtex/lsp/monaco`, and `wasmtex/lsp/server`.
For setup, use [language integration](language-integration.md). Parser and catalog
implementation details are in [language service architecture](language-service.md).

### Command database & signatures

For hosts building their own completion/hover UI on top of `wasmtex/lsp`:

| Export | Purpose |
|--------|---------|
| `getCommandSignature` / `parseSignature` / `formatSignature` | Resolve and render a command's argument signature. |
| `getCommandPackage` | The source `\usepackage` a command belongs to. |
| `registerShard` | Register an extra package-command shard with the DB. |
| `PackageShardLoader` / `ShardStore` / `PackageShardLoaderOptions` / `PackageShard` | On-demand per-package shard fetching + pluggable cache store. |
| `CommandArg` / `CompletionValueKind` | Typed argument descriptor and its semantic value domain. Arguments may also declare comma-list, key-family, resource-selector, and project-key-family selector relationships. |
| `HttpTexResourceCatalogProvider` / `TexResourceCatalogProvider` | Profile-bound exact class/package/bibliography/font availability. |
| `HttpTexSemanticCatalogProvider` / `TexSemanticCatalogProvider` | Profile-bound typed options, key/value families, commands, environments, colors, provenance, and coverage. |
| `analyzeCompletionContext` / `CompletionContext` | Parse a LaTeX command invocation or `.bib` entry at a cursor, including unfinished input, list/key-value position, selectors, BibTeX entry metadata, and an exact replacement range. |
| `CompletionResolverRegistry` / `createDefaultCompletionRegistry` | Register isolated command metadata and host-neutral value-domain resolvers. |
| `CompletionResolver` / `CompletionResolverEnvironment` | Resolver contract over the active document, project index, VFS, position, and optional cancellation token. |

## LSP Core

Use `wasmtex/lsp` when you want LaTeX intelligence without taking WasmTex's editor/viewer.

```ts
import { createLatexLanguageService } from 'wasmtex/lsp'

const lsp = createLatexLanguageService({
  files: {
    'main.tex': '\\section{Intro}\\label{sec:intro}\\ref{missing}',
  },
})

const diagnostics = lsp.getDiagnostics()
const outline = lsp.getOutline('main.tex')
```

Construct it with `createLatexLanguageService(options?)` or `new LatexLanguageService(options?)`;
`options` (`LatexLanguageServiceOptions`) seeds `files`, `aux`, `engineCommands`,
`semanticTrace`, `lint`, an optional isolated `completionRegistry`, and optional
profile-bound `resourceCatalog` and `semanticCatalog` providers. The editor-neutral result types — `SemanticToken`, `InlayHint`,
`CodeAction`, `DocumentLink`, `FoldingRange`, `SignatureHelp`, `WorkspaceSymbol`,
`Diagnostic`, `FileSymbols`, `SectionDef`, `BibCompletionContext`, `ParsedBibFile`,
`ProjectValue`, and `ProjectKeyDefinition` — are exported from `wasmtex/lsp` for typing
your own UI.

### `LatexLanguageService` Methods

**Project state**
- `loadProject(files): void`
- `updateFile(path, content): void`
- `removeFile(path): boolean`
- `getFile(path): string | Uint8Array | null`
- `listFiles(): string[]`
- `updateAux(content): void` — feed back `.aux` numbers (resolves `\ref`/`\cite` inlay hints).
- `updateEngineCommands(commands): void` — feed back the engine's command hash (improves completion).
- `updateSemanticTrace(trace): void` — feed back semantic-trace data for richer tokens.
- `setMainFile(path): void` — selects the compile root used to validate runtime snapshot identity.
- `configureCompletion(configuration): void` — atomically replaces the completion profile, resource/semantic providers, and optional registry while retaining the existing project index; prior runtime evidence is cleared so profile-scoped metadata cannot leak across a host profile switch.
- `updateCompletionSnapshot(snapshot): Promise<CompletionSnapshotState>` — validates bounds/profile and recomputes the current project revision before accepting runtime evidence.
- `getCompletionSnapshotState(): CompletionSnapshotState` — reports `absent`, `fresh`, or `stale` and returns a defensive snapshot copy.

**Language features** (all return editor-neutral types)
- `getDiagnostics(): Diagnostic[]`
- `getFileSymbols(path): FileSymbols | undefined`
- `getOutline(path): SectionDef[]`
- `getCompletionContext(path, line, column): CompletionContext | null`
- `getCompletions(path, line, column, cancellationToken?): NeutralCompletionItem[]`
- `getCompletionResult(path, line, column, cancellationToken?): NeutralCompletionList` — includes `isIncomplete` while a lazy resource shard is loading.
- `getCompletionResultAsync(path, line, column, cancellationToken?): Promise<NeutralCompletionList>` — waits once for the lazy resource/semantic catalog work started by this request, then recomputes the result. Monaco and JSON-RPC use this form so a trigger such as the opening `{` in `\documentclass{` can return the cold catalog without another keystroke.
- `getHover(path, line, column): NeutralHover | null`
- `getDefinition(path, line, column): NeutralLocation | null`
- `getReferences(path, line, column): NeutralLocation[]`
- `getSignatureHelp(path, line, column): SignatureHelp | null`
- `getDocumentHighlights(path, line, column): LFRange[]`
- `getWorkspaceSymbols(query): WorkspaceSymbol[]`
- `getFoldingRanges(path): FoldingRange[]`
- `getInlayHints(path): InlayHint[]`
- `getDocumentLinks(path): DocumentLink[]`
- `getSemanticTokens(path): SemanticToken[]`
- `getCodeActions(path, line): CodeAction[]`
- `getRenameEdits(path, line, column, newName): LatexWorkspaceEdit | undefined`

**Escape hatches**
- `getProjectIndex(): ProjectIndex`
- `getVirtualFileSystem(): VirtualFS`
- `getCompletionRegistry(): CompletionResolverRegistry`
- `getResourceCatalogState(kind): TexResourceCatalogState | null`
- `loadResourceCatalog(kind, cancellationToken?): Promise<TexResourceCatalogState> | null`
- `getSemanticCatalogState(scopeId): TexSemanticCatalogState | null`
- `loadSemanticCatalog(scopeId, cancellationToken?): Promise<TexSemanticCatalogState> | null`

Signature help shares the completion invocation analyzer and scoped command metadata.
`activeParameter` indexes the declared signature, including omitted optional arguments;
`argumentIndex` indexes groups actually supplied at the call site. `command`, `starred`,
and defensive `parameterDetails` records identify the confirmed argument structure.
`parameters` retains the rendered strings for existing adapters.

Nested calls return to the enclosing command after closing. Comments, verbatim,
inactive branches, unmatched argument shapes, and unknown signatures produce no help.
Known sectioning stars use their own signature. Registry overrides can register an
explicit `name*` signature; an arbitrary star does not inherit the unstarred form.
Project `newcommand` declarations support up to nine parameters and a first optional
default. Project xparse declarations support `m`, `o`, `O{default}` and a leading `s`;
other specifiers remain unsupported. `CommandArg.balancedOptional` records xparse
bracket nesting; legacy optional arguments end at the first brace-unprotected `]`.
The leading star boolean is represented by `starred`, while displayed argument names retain their declaration parameter numbers.
Conflicting or replacement declarations suppress catalog fallback. TeX binding order
and dynamic execution are not resolved. Runtime hash-table arity alone does not prove
brace/bracket argument structure and is not promoted into signature help.

Package/class semantic signatures are selected from the current active load graph,
including declared package dependencies. Extracted xparse records require
`argumentSyntax: 'xparse-v1'`: the extractor confirms `m`, `o`, `O{default}` and
leading `s`, with `acceptsStar` recording the latter. Older xparse shards lack this
confirmation and are excluded from argument help; regenerate their immutable catalog
before relying on these signatures. Unsupported specs retain command discovery but
provide no inferred argument structure. Removing a load retracts its signature even
if an earlier asynchronous shard request finishes later. Explicit host registry
commands remain service-local overrides. Monaco and the neutral service use the same
project and package metadata selection.

Document highlights identify structural label, citation and project command occurrences
in the requested file. They omit targets with conflicting declarations in the active
include/load component, including shared files reached from multiple roots. Command
highlights require exactly one project declaration in that component that does not
replace or retain an existing binding. Parsed `CommandDef.mayRedefine` records that
uncertainty for renew/provide/declare forms and primitive definitions or assignments
(`def`, `gdef`, `edef`, `xdef`, `let`, `futurelet`). Expansion order and local TeX
binding scopes are not resolved. Duplicate bibliography keys likewise
suppress citation highlights. The ranges do not classify reads/writes or mathematical
entity identity.

`ProjectIndex.getStats()` returns `ProjectIndexStats`, including deterministic counts and
an estimated retained UTF-16 metadata size. It is intended for regression budgets rather
than as a JavaScript heap profiler.

### Exact TeX Live resource completion

The host chooses the catalog identity as part of the compile profile; the LSP does
not discover it by querying CTAN or by compiling on completion:

```ts
import {
  createLatexLanguageService,
  HttpTexResourceCatalogProvider,
  HttpTexSemanticCatalogProvider,
} from 'wasmtex/lsp'

const identity = {
  schemaVersion: 1,
  texliveYear: '2025',
  mirrorRevision: '2025-0123456789abcdef',
} as const
const resourceCatalog = new HttpTexResourceCatalogProvider({
  baseUrl: 'https://cdn.example/2025/',
  identity,
  store: catalogStore, // optional async get/set store, e.g. IndexedDB-backed
})
const semanticCatalog = new HttpTexSemanticCatalogProvider({
  baseUrl: 'https://cdn.example/2025/',
  identity,
  store: semanticStore,
})

const lsp = createLatexLanguageService({ files, resourceCatalog, semanticCatalog })
```

A long-lived host that switches compile profiles should construct fresh providers and
call `lsp.configureCompletion({ completionProfile, resourceCatalog, semanticCatalog })`.
The replacement is synchronous, keeps project symbols intact, discards the previous
runtime snapshot, and uses a fresh isolated resolver registry; in-flight loads on the
old providers can therefore never populate the new profile.

The provider loads immutable `catalog/<mirrorRevision>/index.json` and only the
requested class/package/bibliography/font shard. It verifies the shard hash and
fails closed on schema, year, or mirror-revision mismatch. `WasmTexOptions` accepts
the same provider for the built-in Monaco integration. Project-local `.cls`, `.sty`,
`.bst`, biblatex, and supported font files remain available without a catalog and
take precedence over matching mirror records.

`getCompletionResult()` remains the non-blocking synchronous primitive and reports
`isIncomplete` while a requested shard loads. `getCompletionResultAsync()` collects
only the catalog work started by that cursor context, waits for it once, and recomputes
the neutral result. The built-in Monaco and JSON-RPC adapters use the asynchronous form;
catalog errors still degrade to project-local candidates instead of holding the request.

Semantic shards are selected as `class/<name>` or `package/<name>`. They expose
`TexSemanticKeyFamily`, `TexSemanticKey`, `TexSemanticCommand`, `TexSemanticColor`, provenance,
confidence, dependencies, engine constraints, and coverage. A key with value type
`flag` inserts only its name; other keys insert a `key=` snippet. Enum and boolean
values complete directly, while color/file/command/bibliography/font values reuse
the corresponding typed resolver. Already-used keys disappear only when the shard
marks them non-repeatable; unknown values are never rejected.

Project-local completion does not require either catalog. The active include/load graph
contributes counters, lengths, custom/theorem environments, glossary/acronym keys, font
families/aliases, and recoverable key families/enums. Typed file domains cover TeX,
bibliography, graphics, listings/verbatim, data, and generic files. `.bib` documents add
entry-type, type-ranked field, `crossref`/`xdata`, and `@string` domains. Literal prose,
braced/quoted bibliography values, dimensions/numbers, and dynamic declarations remain
free-form unless a host registers more metadata.

The `color` domain is include-graph and package aware. Base `color`/`xcolor` names,
option-gated `dvipsnames`/`svgnames`/`x11names` palettes, and project declarations
from `definecolor`, `providecolor`, `colorlet`, and `definecolorset` feed the same
resolver used by `color`, `textcolor`, `colorbox`, `fcolorbox`, and typed keys such
as `linkcolor`. Completion inside an xcolor expression replaces only its active name
segment. Starred palette options such as `svgnames*` expose only names subsequently
activated by `definecolors` or `providecolors`. A color candidate may include `NeutralCompletionItem.data.wasmtex.color.css`
and provenance metadata; both the Monaco and JSON-RPC adapters preserve that object.

### Runtime completion snapshots

Static catalogs describe what a selected class/package version declares. A normal
compile can additionally observe commands, environments, counters, colors, key
families, and loaded resources created dynamically by TeX. This evidence is returned
as `CompileResult.telemetry.completionSnapshot`; requesting completion never starts a
compile. `pdflatex` currently observes command/registry fields. XeLaTeX and LuaLaTeX
use the same schema and explicitly mark unavailable fields `unsupported`.

Precedence is deterministic: project declarations override fresh runtime observations,
which override inferred static metadata. Exact/declared catalog candidates remain
available when runtime evidence has no matching record. Any file add, removal, or edit
immediately makes the snapshot stale and removes its candidates; only a snapshot whose
SHA-256 project revision and compile profile match the current LSP project becomes fresh.

### Static linter (ChkTeX-style)

`getDiagnostics()` includes style/correctness lint warnings (no compile needed)
alongside the reference/citation checks. The linter is comment/verbatim/math
aware (it never fires inside comments, `\verb`, verbatim environments, or — for
text rules — math mode). Each rule is individually toggleable with a severity;
lint diagnostics use codes distinct from the index diagnostics, so the two never
double-report. Results are cached per `.tex` file, and `updateFile()` re-lints
only content that changed.

Configure via the `lint` option (on `WasmTex` and `LatexLanguageService`):
`false` disables the linter; an object overrides per-rule `enabled`/`severity`.

```ts
import { createLatexLanguageService } from 'wasmtex/lsp'

const service = createLatexLanguageService({
  files,
  lint: {
    'straight-double-quotes': { enabled: false, severity: 'info' }, // turn one rule off
    'space-before-punctuation': { enabled: true, severity: 'error' }, // bump severity
  },
})
```

You can also lint a single string directly: `lintSource(content, path, config?)`.
`DEFAULT_LINT_CONFIG` exposes the defaults.

| Rule (`code`) | Default | Flags |
|---------------|---------|-------|
| `nbsp-before-ref` | info | A plain space before `\ref`/`\cite`/… (suggests `~`). |
| `space-before-punctuation` | warning | Whitespace before `, ; : ! ?`. |
| `doubled-space` | info | Two or more spaces between words. |
| `ellipsis` | info | Literal `...` (suggests `\dots`/`\ldots`). |
| `straight-double-quotes` | info | A straight `"` (suggests `` `` `` / `''`). |
| `display-math-dollars` | warning | `$$ … $$` (suggests `\[ … \]`). |
| `en-dash-range` | info | A hyphen between digits, e.g. `10-20` (suggests `--`). |
| `math-operator-as-text` | warning | `sin`, `log`, … as plain text in math mode (suggests `\sin`). |
| `footnote-spacing` | info | A space before `\footnote`. |
| `abbreviation-spacing` | info (off) | `e.g.`/`i.e.` followed by a plain space. Off by default. |
| `a11y-graphics-alt` | info | Graphics without alt text. |
| `a11y-float-caption` | info | Figure/table floats without captions. |
| `a11y-heading-skip` | info | Skipped heading levels. |
| `a11y-pdf-metadata` | info | Missing document title/language metadata. |

See [tagged PDF export](compiler-api.md#accessible-export-tagged-pdf--pdf-ua) for the
compile-time report; lint warnings alone do not establish PDF/UA conformance.

### Monaco Adapter

Use `wasmtex/lsp/monaco` when you want the existing Monaco completion, hover,
definition, reference, symbol, and rename providers.

```ts
import { createLatexLanguageService } from 'wasmtex/lsp'
import { ensureLanguagesRegistered, registerLatexMonacoProviders } from 'wasmtex/lsp/monaco'

ensureLanguagesRegistered()
const service = createLatexLanguageService({ files })
const disposables = registerLatexMonacoProviders(service, {
  onWorkspaceEdit(edit) {
    // Apply via your app state or Yjs transaction.
  },
})
```

The Monaco providers are thin adapters over editor-neutral cores in `src/lsp/`
(`neutral-providers.ts`, `language-features.ts`) — none of which import Monaco —
so the same logic backs both the Monaco adapter and the LSP server below.

### Standalone LSP server

Use `wasmtex/lsp/server` to run the language intelligence as a JSON-RPC
[Language Server](https://microsoft.github.io/language-server-protocol/) in any
host (VS Code, Neovim, or a browser Web Worker). `LatexLspServer` is
transport-agnostic: give it a `send` callback and feed it incoming messages with
`handle()`. It implements `initialize`, `textDocument/didOpen`/`didChange`,
`completion`, `hover`, `definition`, `references`, `rename`, and pushes
`publishDiagnostics`.

Requests are tracked until their result or error settles. `$/cancelRequest` affects
only a currently active ID; unknown or completed IDs are ignored. A cancelled
request receives one `RequestCancelled` (`-32800`) error when its operation settles,
including when that operation rejects. Cancellation does not roll back document or
snapshot updates or abort shared catalog loading. IDs can be reused after settlement;
reusing an active ID is rejected without replacing its original operation.

Malformed supported-method parameters return `InvalidParams` (`-32602`), while
unexpected service failures return `InternalError` (`-32603`). Invalid document
notifications are ignored before mutation and receive no response. Positions must
be nonnegative protocol integers; text and URIs must have the expected string types.
Document changes use full text synchronization; ranged changes are rejected instead
of being mistaken for replacement documents. Missing document versions retain the
existing default of zero and an empty change list remains a no-op.

Three WasmTex extension methods carry runtime evidence: send
`wasmtex/updateCompletionSnapshot` with `{ snapshot }` and await its response before
requesting completion; query `wasmtex/completionSnapshotState` with no parameters. Set
the active compile root with `wasmtex/setMainFile` and `{ path }` when it differs from
the `LatexLanguageService` default `main.tex` (or pass `mainFile` to its constructor).
Separate compiler hosts should also pass the exact `completionProfile` expected by the
language service; catalog identities independently verify TeX Live mirror compatibility.
Invalid, wrong-profile, or unsupported-version payloads return a JSON-RPC error;
over-budget collections are deterministically truncated and marked incomplete. A
revision mismatch is retained as `stale`, never consumed as completion data.

```ts
import { LatexLspServer } from 'wasmtex/lsp/server'

// Browser Web Worker transport (host side mirrors this).
const server = new LatexLspServer((msg) => self.postMessage(msg))
self.onmessage = (e) => server.handle(e.data)
```

```ts
// Node stdio transport sketch (for a VS Code / Neovim binary):
const server = new LatexLspServer((msg) => writeMessage(process.stdout, msg))
readMessages(process.stdin, (msg) => server.handle(msg))
```
