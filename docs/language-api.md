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
- `updateAux(content): void` — feed back one `.aux` fragment for labels and citations.
- `updateAuxFiles(files): void` — replace aux data with a compiler-output `AuxFileSet`, resolving its recursive `@input` graph.
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

`readAuxFiles(root, readOutput)` collects an `AuxFileSet` from a host-authorized
compiler-output reader. `parseAuxFiles(files)` resolves only those supplied bytes.
Both use paths relative to the TeX working directory, including when the root is
`docs/main.aux`; included paths are not made relative to that aux file's directory.
Reads stay within relative `.aux` paths, reject TeX-dependent path expressions,
and are bounded to 1,024 files and 2 Mi UTF-16 code units. Missing, invalid, or
over-budget inputs mark the result incomplete; incomplete sets provide no inlays.
Repeated labels within or across outputs are omitted rather than choosing an input order.

`AuxData.labels` retains its number-only map for existing callers. Its optional
`labelDetails` map holds `AuxLabel` records with separate `number` and optional
`page` fields. A missing page never falls back to the number. Inlays currently
resolve literal `ref`, `eqref`, and `pageref` keys; unsupported reference commands,
multiple keys, and unexpanded TeX fields provide no inferred display value.
The host owns matching these outputs to its current compile root, profile and
source revision; supplying a fragment is not proof of freshness.

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

### Reviewed reference repair

`getReferenceProblem(path, offset, cancellationToken?)` returns
`{ ok: true, problem }`, where `problem` is an undefined reference or duplicate
label at that exact key token, or `null`. Offsets are zero-based, end-exclusive
UTF-16 source positions. The selected `mainFile` owns the outgoing include/load
graph; labels from other roots are not candidates, even when they include this
root. `ProjectIndex.getRootFiles(root)` exposes that same outgoing graph.

Undefined references offer unambiguous literal definitions with their source
locations and existing heading/caption context. Duplicate labels return every
literal conflicting declaration and supported literal reference. Comments,
verbatim, inactive branches, definition templates, dynamic or list-valued keys,
and project-redefined reference commands cannot authorize an edit. Generated
labels still prevent false undefined/collision decisions, but never acquire
invented editable locations. Keys support Unicode letters, marks and numbers
plus `:._/-`, with a maximum of 256 UTF-16 units.

`planReferenceRepair(request, cancellationToken?)` recomputes the problem and
returns expected-source edits (`file`, `range`, `expectedText`, `newText`). An
undefined-reference request carries its exact `anchor` and selected `target`.
A duplicate-label request carries its exact declaration `anchor`, a fresh
`newKey`, and explicitly chosen `references`; an empty reference selection
renames only the declaration. The service never guesses which ambiguous
references follow it and never creates a label to hide an undefined reference.
Neither query mutates source. Returned records are detached from the index.

Queries refuse cancellation, stale anchors/selections, invalid or colliding keys,
and graphs exceeding 1,024 files, 4,000,000 source units or 10,000 editable
occurrences. Hosts must bind the query and review to the same project, source,
root, profile and access lifetime, then validate expected source at application.
They own collaborative application and Undo, as with selection wrapping.

When the selected root exists, `getDiagnostics()` uses this same literal inventory
for reference diagnostics. Each duplicate declaration has a marker with its total
declaration count and up to 32 other source locations in `relatedInformation`;
the explicit repair query retains the full bounded conflict list. Unsupported or
over-limit inventories do not produce repairable markers. Without a loaded root,
legacy project-wide diagnostics remain available. Other diagnostic families and
the legacy line-based `getCodeActions()` API are unchanged; hosts implementing
reviewed reference repair should use these exact-token APIs.

### Reviewed diagnostic repair

`getDiagnosticRepairs(path, offset, cancellation?)` asynchronously returns typed
`missing-required-argument` and `missing-package` proposals at a command token.
Offsets and edit ranges are UTF-16 and end-exclusive. Each proposal contains a
diagnostic, exact source anchor, selected root, revision fences and expected-source
edits. `planDiagnosticRepair(proposal, cancellation?)` recomputes the evidence and
returns fresh edits, or refuses stale, cancelled, unsupported or over-limit work.
Neither method writes source. Hosts present the review and own permissions,
collaborative application and Undo; they must recheck their project/model identity
before applying the returned edits.

Required-argument proposals add only empty `{}` slots. Supported omitted optional
arguments and legal single-token required arguments are not missing arguments.
The scanner uses cached source tokens and masked regions, preserves comments,
and treats unsupported argument consumption as opaque. Project declarations use
the selected root's outgoing include/load graph; possible redefinitions retract
the affected grammar.

Package proposals additionally require `completionEngine`, an exact
`completionProfile` with a mirror revision, and a matching resource catalog.
After a compile, call `updateDiagnosticCompileContext({ snapshot, log }, cancellation?)`
with that result's completion snapshot and log. This validates the full project
digest, root, engine and profile before admitting direct undefined-command evidence.
A PDF or `success: true` alone does not establish an error-free compile. Truncated
command inventories and absent semantic-catalog commands do not prove absence.
The package path uses an exact source-matched engine error, the SDK's command-to-package
authority, a complete recorder inventory, and an available resource under the
selected profile. Already loaded dependencies, project declarations and local
package shadowing suppress the proposal. The edit adds `\\usepackage` after the
selected root's literal top-level class declaration and supported root option directives,
including the class's optional release argument. The insertion must precede input,
direct use and document boundaries; unresolved conditional or nested option directives
provide no safe insertion point. This also applies when the error
is in an included file. Missing or ambiguous document boundaries produce no proposal.

`clearDiagnosticCompileContext()` invalidates stored evidence and pending admissions.
Source, root, profile, compile-context or completion-context changes invalidate
earlier proposals. Compile-context admission returns the number of source-matched
undefined commands; it is not a count of available package fixes. These methods
are editor-neutral; the legacy line-based `getCodeActions` API is unchanged.

A text-only Worker may include `binaryInputs` generated by
`diagnosticCompileBinaryInputs(compiledFiles)` when admitting the compile context.
These path/digest records complete the compiler's full project identity without
transferring image/font/PDF bytes. They cannot replace indexed files or TeX support
sources; all text files must still be synchronized with the service. The host owns
the external assets and must clear the context on their changes, project switches
or loss of its full-input freshness proof. Source edits continue to invalidate
plans inside the SDK independently.

### Reviewed selection wrapping

`getWrapOptions(path, { startOffset, endOffset }, cancellationToken?)` returns
`{ ok: true, options }` or `{ ok: false, reason }`. Offsets are zero-based,
end-exclusive UTF-16 positions in the current source. Each option specifies the
command/environment name, confirmed argument signature, and `selectionArgument`;
`null` means an environment body. Returned metadata is a detached copy.

`planWrapSelection(path, { range, kind, name, arguments }, cancellationToken?)`
rechecks the current project and returns one `{ range, expectedText, newText }`
edit, or a refusal. The argument array is signature-indexed: supply `null` for
the selection slot and omitted optional slots, and explicit source strings for
other required slots. The selected source is retained exactly, including its
Unicode and line endings. Environment wrappers add LF separators around that
unchanged body. Neither method writes source or changes the project index.

The supported text commands are `emph`, `textbf`, `textit`, `texttt`, and
`underline`; math commands are `mathrm`, `mathbf`, `sqrt`, and `frac`. Text
positions offer `quote`, `quotation`, `center`, `flushleft`, `flushright`, and
`equation` environments. Math positions offer `aligned` when `amsmath` is active.
This explicit SDK catalog establishes wrapper roles; arbitrary completion
snippets and user macros do not establish them. Project declarations, including
robust, primitive and possible redefinitions, retract affected built-in wrappers.

Wrapping refuses comments, verbatim, inactive branches, definition templates,
uncertain command arguments, crossed or unclosed groups/environments, math
delimiter crossings and incomplete notation. Only the listed environment bodies
and `document` establish container context; unknown environment arguments (for
example `tabular` column specifications or `minipage` widths) are never treated as
prose. An existing `aligned` optional position argument remains unsupported.
Document delimiters cannot be wrapped. Text environments are omitted inside brace
groups, and command wrappers are omitted for paragraph breaks, environment
boundaries and math alignment separators. Unbraced script arguments require a
larger complete selection. Additional argument source is checked in an isolated
syntax snapshot using the current project metadata; it is not executed or expanded
into editor source. `equation` bodies must also pass the math syntax boundary.

Queries are explicit authoring actions. They reuse indexed group boundaries while
scanning the active source; they do not run per keystroke. The limits are 1,000,000
UTF-16 source units, 65,536 selected units and 16,384 units per extra argument.
Cancellation returns a refusal. Refusal reasons are stable codes, leaving display
text and localization to the host.

Hosts must capture model/project/root/profile/access lifetimes, review the source
change, and apply the expected-source edit only if those lifetimes remain current.
The edit is not an authorization to mutate another source revision. Hosts own
cancellation, collaborative application and Undo. These APIs establish a bounded
source transformation, not successful compilation, mathematical equivalence or
preserved equation numbering.

### Structural selection

`getSelectionRanges(path, line, column, cancellationToken?)` returns a flat array
of 1-based, end-exclusive UTF-16 ranges, smallest first. Every parent strictly
contains the preceding range; duplicates and crossing candidates are omitted.
The cursor is inside a half-open source range. Empty, out-of-document, cancelled
and masked positions return an empty array.

Complete brace groups provide content and delimiter ranges. Confirmed command
signatures use the same invocation reader and project/package authority as
parameter hints; supplied optional groups respect legacy versus xparse bracket
rules. A complete supported invocation adds its command range. Unknown commands,
unsupported stars, unbraced arguments and incomplete calls do not invent an
invocation range, although independently complete brace groups remain selectable.
Properly nested literal environment pairs add their full source range.

The parser caches group boundaries and source masks with its existing token pass.
Queries read those boundaries without retokenizing or exposing the private cache
in public file symbols. `ProjectIndex.getStats().estimatedBytes` includes the cache's
estimated payload. Project grammar is resolved at query time so cross-file
signature changes cannot leave a cached invocation decision behind. Comments,
verbatim, inactive branches and definition templates provide no selection ranges;
macro expansion never adds a virtual editor location. Mathematical semantics
remain the responsibility of downstream consumers.

The Monaco adapter maps each requested cursor to its own range chain and rejects
cancelled or text-unsynchronized requests. JSON-RPC advertises
`selectionRangeProvider` and supports `textDocument/selectionRange`, converting
chains to nested `parent` records. A protocol position without structural evidence
gets a zero-width range at that position. Hosts own model/revision lifetimes and
can keep this read-only navigation available to viewers.

### Linked environment editing

`getLinkedEditingRanges(path, line, column)` returns `LinkedEditingRanges | null`
with two 1-based, end-exclusive name ranges and a `wordPattern` string. Both
names must be complete, literal and correctly nested. A cursor in either name,
including its end boundary, selects the same pair. The parser computes pairs with
its existing token stream; cursor queries do not tokenize again.

Comments, escaped commands, verbatim-like environments, false conditional branches
and macro/environment definition templates do not authorize linked edits. Malformed
or mismatched delimiters break pairing instead of searching past them for a matching
name. Names use ASCII letters, digits, `@`, `:`, `_`, `*` and `-`; dynamic names and
other syntax return no pair. This is source editing, not environment validity checking.

The Monaco adapter registers `LinkedEditingRangeProvider`; hosts enable Monaco's
`linkedEditing` option for editable models. The JSON-RPC server advertises
`linkedEditingRangeProvider` and handles `textDocument/linkedEditingRange` with
zero-based protocol positions. Hosts own access control, model/index synchronization,
remote-edit cancellation and ordinary undo/collaboration behavior; the neutral query
never writes source.

### Reference completion context

Reference candidates search label keys, directly associated source titles/captions,
file locations, and supported aux number/page values with case-insensitive substring
matching. `insertText` remains the label key and `replacementRange` replaces only the
active argument. An unfinished argument stops its replacement before the next
command or line, preserving the literal suffix on the current line. `filterText` lets native Monaco and JSON-RPC clients retain candidates
matched by their context. Duplicate definitions in the active include component are
omitted instead of choosing a destination.

`LabelDef.context` and `NeutralCompletionItem.data.wasmtex.reference.context` hold
`kind`, `title` (at most 256 UTF-16 code units), and `source` (at most 1,024).
The completion metadata also includes `definition` with its source file, line and
column. Context requires a complete literal heading/caption immediately followed by
its label, allowing whitespace/comments. Intervening prose or commands, incomplete
arguments, and macro/environment definition templates provide no title association.
The kind identifies the source command, not inferred counter or float ownership.
Documentation renders the bounded source in an escaped Markdown code fence.

`ref`/`eqref` use the number and `pageref` uses the page. Incomplete aux sets and
unexpanded TeX fields provide no display/search value; source candidates remain.
The integrating host must clear aux evidence when its compile inputs become stale
and reject requests crossing a compile-context change, including source-identical
recompiles. Source context itself updates through the ordinary file index lifecycle.

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
