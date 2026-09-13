# Language service integration

For application developers adding language features to an existing editor or service.
[Install the SDK](howto.md#installation), then choose the neutral service, Monaco
adapter or JSON-RPC transport. See the [language API](language-api.md) for methods
and [shared syntax API](syntax-api.md) for composed consumers.

## Standalone LSP

Start with the neutral service; this requires no Monaco instance or engine assets:

```ts
import { createLatexLanguageService } from 'wasmtex/lsp'

const service = createLatexLanguageService({
  files: { 'main.tex': String.raw`\section{Intro}\label{sec:intro}\ref{missing}` },
})
const diagnostics = service.getDiagnostics()
const outline = service.getOutline('main.tex')
```

### Add Monaco and exact mirror completion

The following integration sketch assumes your host supplies `files`, a
`compileProfile` with matching mirror/catalog identity, and optional catalog stores.
Omit the `store` options if you do not provide durable catalog storage. A neutral
service without Monaco needs only the catalog providers and service constructor.

Use the LSP entrypoints when you want LaTeX diagnostics/outline/rename without
using the built-in editor/viewer.

```typescript
import {
  createLatexLanguageService,
  HttpTexResourceCatalogProvider,
  HttpTexSemanticCatalogProvider,
} from 'wasmtex/lsp'
import { ensureLanguagesRegistered, registerLatexMonacoProviders } from 'wasmtex/lsp/monaco'

const resourceCatalog = new HttpTexResourceCatalogProvider({
  baseUrl: compileProfile.texliveUrl,
  identity: compileProfile.completionCatalog,
  store: catalogStore, // optional host-owned offline cache
})
const semanticCatalog = new HttpTexSemanticCatalogProvider({
  baseUrl: compileProfile.texliveUrl,
  identity: compileProfile.completionCatalog,
  store: semanticStore,
})
const lsp = createLatexLanguageService({ files, resourceCatalog, semanticCatalog })

ensureLanguagesRegistered()
const disposables = registerLatexMonacoProviders(lsp, {
  onWorkspaceEdit(edit) {
    // Apply edits to your app state or CRDT layer.
  },
})

const diagnostics = lsp.getDiagnostics()
// On unmount: for (const disposable of disposables) disposable.dispose()
```

The catalog identity must come from the same compile profile that selects the
engine and TeX Live mirror. If a custom mirror has no matching catalog, omit the
provider: project-local resources still complete, but WasmTex deliberately does
not guess which mirror classes or packages exist. The synchronous
`getCompletionResult()` call returns `isIncomplete` on the first request for a lazy
shard. The Monaco and JSON-RPC adapters use `getCompletionResultAsync()`, which waits
for the request's shard once and returns its candidates on the original trigger—for
example, immediately after the opening `{` in `\documentclass{`—without requiring a
second keystroke.
Use the same identity for the semantic provider. It supplies class/package load
options, key families, typed values, and package command/environment signatures;
exact color definitions and option-gated xcolor palettes use the same profile-bound
shards. Project color declarations remain local and are scoped through the active
include graph. Schema/year/revision mismatch is isolated rather than mixed with the
active profile.

When the host changes a long-lived editor to another compile profile, create new
providers for that exact identity and call
`lsp.configureCompletion({ completionProfile, resourceCatalog, semanticCatalog })`.
This retains the project index but clears prior runtime evidence and swaps in a fresh
resolver registry, so completed loads from the old profile cannot leak into the new one.

If compilation and LSP run in separate processes, forward the snapshot from the
latest stabilized full compile and await revision validation:

```typescript
const result = await compiler.compile()
const snapshot = result.telemetry?.completionSnapshot
if (snapshot) {
  lsp.setMainFile(snapshot.identity.root)
  await lsp.updateCompletionSnapshot(snapshot)
}
```

Completion itself never compiles. Editing, adding, or removing any project file makes
the prior runtime evidence stale immediately. The next matching full compile refreshes
it. Keep the LSP's host-owned file set aligned with the files used to build the snapshot;
generated auxiliary files are not part of the project revision.

The same neutral completion path also indexes project-local semantic values. It completes
counters and lengths, theorem/custom environments, glossary and acronym keys, declared
font families/aliases, and statically recoverable xkeyval/pgfkeys/LaTeX3 key families and
enum values. Typed file arguments filter compatible TeX, `.bib`, graphics, source-listing,
verbatim, CSV/data, or generic project files while preserving the path style already being
typed (`/`, `./`, or `../`). `.sty` and `.cls` files participate when reached through a
project-local package/class load edge.

Inside `.bib` files, completion offers BibTeX/biblatex entry types, fields ranked for the
current entry type, `crossref`/`xdata` targets, and bare `@string` macros. The analyzer is
safe on unfinished entries and supplies exact replacement ranges to both Monaco and
JSON-RPC. Arbitrary titles, author text, literal braced/quoted values, dimensions, numbers,
and package constructs that cannot be recovered statically remain free-form.
