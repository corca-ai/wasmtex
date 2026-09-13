# Language service architecture

### Parser & tokenizer
Language features are backed by a small, error-tolerant LaTeX parser:

- **`src/lsp/latex-tokenizer.ts`** — `tokenize(source): Token[]` is a catcode-aware
  lexer. It models the catcodes that matter for source intelligence — control
  sequences, group braces `{}`, math toggles (`$`, `$$`, `\(`, `\[`), comments,
  macro parameters (`#1`), and verbatim regions (inline `\verb`, and verbatim-like
  environment bodies). Every `Token` carries an absolute offset plus a 1-based
  line/column, and the tokenizer never throws on malformed input.
- **`src/lsp/latex-parser.ts`** — `parseLatexFile(content, filePath): FileSymbols`
  tokenizes, then **masks** regions that must not be interpreted (comments, inline
  `\verb`, verbatim environment bodies, and the false branch of
  `\iffalse`/`\iftrue`…`\fi`) by blanking them while preserving newlines, so
  positions stay exact. Symbols are then extracted over the whole masked text, so
  **multi-line arguments** work and commented/verbatim content is ignored.
  User macros that wrap `\label`/`\ref`/`\cite` (e.g. `\newcommand{\fig}[1]{\label{#1}}`)
  are **shallow-expanded** (bounded depth, cycle-guarded) so the symbols they
  generate are indexed at their call sites.

### Project Index
`ProjectIndex` maintains symbols across all host-owned files in the `VirtualFS`. Besides
labels, citations, and commands, it records active classes/packages, counters, lengths,
custom/theorem environments, glossary/acronym keys, font declarations, project key
families, colors, and bibliography resources. `.tex`, `.sty`, and `.cls` edits re-parse
only the edited file; `.bib` entries and strings are likewise stored and replaced per
file. The cached active graph follows `input`/`include`/`subfile` plus project-local
class/package load edges. Queries for completion use that graph, while per-name navigation
lookups remain backed by inverted indexes.

`LatexSyntaxService` is the parser/index owner for composed authoring runtimes. A host
passes the same instance to `LatexLanguageService`; each stable document update then
produces Document Syntax Snapshot v8 and updates LSP symbols from one token stream.
The snapshot is the single source-preserving boundary for notation roots, visible
prose, citation annotations, scopes, source-order blocks, macros, includes, and neutral
structural declarations. Its notation
arena uses revision-local indices; consumers must not persist them as cross-edit
identity. Unknown and malformed TeX remains bounded as opaque or incomplete structure.
Markdown contributes math, visible prose, and ATX or setext section scopes
without polluting the LaTeX project index.
The service is transport-neutral and can live in a browser Worker or a native
language-server process.

The notation arena is an error-tolerant CST built from that same token stream. It
preserves sequences, groups, commands and consumed groups, scripts, delimiters,
alignments, nested environments, modifiers, styles, and explicit named-operator
surfaces. Literal nodes also carry their neutral lexical category and TeX math
class, so consumers do not independently classify relation, binary, punctuation,
number, and identifier tokens. Parent/child paths retain composition order and UTF-16 ranges. A changed
document replaces its revision-local arena atomically; clean and incremental builds
are equivalent. `findLatexNotationPath` binary-searches math roots and ordered children
instead of serializing a second interval tree. Node count, depth, and opaque argument
recovery are bounded. Optional cancellation is checked between parse phases and during
large notation scans; a cancelled update does not publish partial file or project-index
state.

Core command structure is data-driven by the immutable `MathCommandSpec` registry.
Each entry records neutral argument roles and consumption, TeX math class, optional
star handling, structural/opaque/ignored expansion policy, and package provenance.
The parser has one generic specified-command path; adding an ordinary command does not
add a command-name branch. Test-only conformance compares overlapping entries with the
existing completion/package signature authority without pulling that much larger
catalog into the syntax runtime bundle.

Static project declarations use the same boundary. Bounded macro expansion is
classified through the generic notation parser. A single compositional result
is attached to the real call-site node; a composite result is a range-free
generated-notation sidecar on the macro event. Both use the event's real call
and definition provenance, and neither creates a synthetic editor location.
Removing a definition retracts either form from unchanged callers without
re-tokenizing them. Rich
operator, paired-delimiter, macro, glossary, and acronym records preserve
neutral fields and exact ranges so semantic consumers do not rescan TeX source.
The syntax service reports the exact snapshots invalidated by a project
declaration change and selects callers by the affected macro names instead of
rebuilding or retransmitting unrelated documents.

WasmTex reports observable TeX structure only. Mathematical application, binders,
derivatives, intervals, overloaded operators, domain concepts, laws, and entity
resolution belong to downstream semantic consumers. The dependency is therefore
strictly one-way: a semantic engine may depend on `wasmtex/syntax`; WasmTex never
depends on a semantic engine or an editor host.

Visible prose deliberately excludes citation invocations and the values of `title`,
`author`, and `keywords` commands. Snapshot v8 publishes their exact source ranges,
value ranges, and completeness as neutral `proseAnnotations`; section and environment
containers remain represented by `scopes`. Its non-overlapping `blocks` sequence exposes
only observed heading, paragraph, display-math, list-item, table-row, caption, and
glossary/acronym entry boundaries. Each block has a revision-local parent scope and
optional content range; attribution, rhetorical role, domain relevance, and whether a
claim is established remain downstream semantic decisions.

### Rename (F2)
Rename functionality uses `ProjectIndex.findAllOccurrences()` to find symbols in both `.tex` and `.bib` files. It handles:
- `\label` ↔ `\ref`
- `@article{key}` in `.bib` ↔ `\cite{key}` in `.tex`
- `\newcommand{\cmd}` ↔ `\cmd` usages

Cross-file rename edits are reported to the host via the `workspaceEdit` event.

### Cross-File Navigation
Go-to-definition and references can target locations in other project files. When this happens, WasmTex switches the active file internally and emits a `fileOpen` event so the host can update its UI (file tabs, collaboration bindings, etc.).

### Diagnostics
Project diagnostics cross-reference the `ProjectIndex`. With a loaded selected
root, the language service replaces the legacy reference checks with the same
literal source inventory used by reviewed reference repair. It follows outgoing
include/load edges from that root and reports exact key ranges, including related
duplicate declaration locations. The inventory reuses the parser's private token,
mask and group-boundary cache without retokenizing source. Other families retain
`computeDiagnostics()` in `src/lsp/diagnostic-provider.ts`; without a loaded root,
the legacy project-wide reference checks also remain available. The
ChkTeX-style source linter is cached per `.tex` file: `updateFile()` re-lints
only changed source bytes, while `getDiagnostics()` combines those cached
results with the current project-index diagnostics.

### BibTeX / `.bib` parsing
`src/lsp/bib-parser.ts` is a robust BibTeX/biblatex parser: all entry types, brace- and quote-delimited values with nested braces, multi-line values, `#` string concatenation, `@string` macro expansion, `@preamble`/`@comment`, and `crossref`/`xdata` field inheritance. Parsed entries expose `title`, `author`, `year`, `journal` (venue), and a full `fields` map. `bib-completion-context.ts` separately performs error-tolerant cursor analysis, so incomplete databases get entry-type, type-ranked field, `crossref`/`xdata` target, and bare `@string` macro completion with exact edit ranges. Bibliography declarations select the active `.bib` component; an unreferenced database falls back to the host's full project set. `formatReference()` renders the citation hover preview; the `unused-bib-entry` diagnostic (for any entry never cited) is emitted by `computeDiagnostics()` in `src/lsp/diagnostic-provider.ts`.

### Package-aware command intelligence
`src/lsp/completion-context.ts` parses the complete active command invocation at the cursor instead of matching one line with a command-specific regular expression. It tolerates unfinished input, masks comments and verbatim regions through the shared tokenizer, understands multiline/nested required and optional groups, comma lists, and key/value positions, and returns an exact edit range plus sibling resource selectors. `src/lsp/completion-registry.ts` dispatches that context to typed, host-neutral value-domain resolvers; a service owns an isolated registry and adapters forward cancellation. Monaco and JSON-RPC therefore share the same analysis and candidates.

`src/lsp/package-db.ts` derives argument signatures (required vs optional, with placeholders) from the bundled command snippets and reports each command's source package. Structural commands and package shards may additionally type arguments as class/package resources, labels, citations, compatible project files, colors, counters, lengths, glossary/acronym keys, font families, key/value families, and other semantic domains. File resolvers retain `/`-, `./`-, or `../`-style input and filter TeX, bibliography, graphics, listing/verbatim, and data assets by the typed argument. Project key declarations recover enum values from common xkeyval, pgfkeys, and LaTeX3 forms. Completion is **package-aware**: commands from packages loaded via `\usepackage` (and the LaTeX kernel) rank first, while commands from packages not loaded are still offered but ranked lower and annotated with the `\usepackage{X}` they need. Hover shows the argument signature plus the source package; `getCommandSignature()` supplies builtin argument metadata. Signature help and completion
share the invocation analyzer and project-scoped metadata selector; semantic shards
are selected from the active load graph instead of accumulated as global command overrides.

Arguments left as `free-text`, and dynamic TeX constructs that static parsing cannot
recover, intentionally receive no guessed values. Hosts can extend these positions with
an isolated `CompletionResolverRegistry`; compile-observed runtime semantics are a
separate evidence source rather than an excuse to treat arbitrary text as an enum.

### Exact TeX Live resource catalogs

`scripts/lib/texlive-catalog.mjs` deterministically derives class (`.cls`), package
(`.sty`), BibTeX (`.bst`), biblatex (`.bbx`/`.cbx`/`.lbx`), and supported font-file
shards from the final flattened mirror provenance manifest. The manifest's file
inventory determines an immutable `mirrorRevision`; catalogs are published under
`catalog/<mirrorRevision>/` and carry the TeX Live year, source package, selected
source path, hashes, collision decision, and known engine constraint for every
record. The checker regenerates the expected bytes and rejects missing, extra,
reordered, or altered records.

`src/lsp/resource-catalog.ts` keeps transport outside the completion core. A host
injects a profile-bound provider; the HTTP implementation lazily fetches hashed
shards, accepts a pluggable offline store, deduplicates concurrent loads, and rejects
schema or profile mismatches. The synchronous neutral result explicitly sets
`isIncomplete` until a shard is ready; the async neutral API and the Monaco/JSON-RPC
adapters collect the exact lazy work started by a request, await it once, and recompute
the same cursor context so an opening-brace trigger can show a cold catalog without a
second edit. Without a matching provider, only project-local resources are
offered—there is no guessed mirror fallback. Project files are ranked first and
shadow same-named mirror entries. The same registry feeds Monaco, the neutral API,
and JSON-RPC LSP.

### Typed class/package semantic shards

Resource existence and resource semantics are separate immutable layers.
`scripts/lib/tex-semantic-extractor.mjs` reads the exact mirrored `.cls`/`.sty`
bytes and extracts legacy `DeclareOption`, kvoptions, `define@key`, l3/modern key
declarations, pgfkeys, and xparse command/environment signatures with balanced-group
parsing. It also extracts package/project color declarations; the xcolor shard reads
the selected mirror's `dvipsnam.def`, `svgnam.def`, and `x11nam.def` bytes and records
their activating package/class options. Starred palette options remain deferred until
the project activates individual names with `definecolors` or `providecolors`. Dynamic catch-alls are reported as unsupported instead of silently treated
as complete. An optional observed report comes from the bounded, network-isolated
probe contract; `scripts/tex-semantic-overrides-<year>.json` supplies MIT,
WasmTex-authored high-value corrections. Every record retains declared, observed,
inferred, or override provenance plus confidence.

The deterministic generator emits `semantic/<mirrorRevision>/{classes,packages}/`
shards, an index, and a coverage report that separates exact, declared, observed,
inferred, overridden, and unresolved metadata. Overrides are applied only when the
matching resource exists in the final mirror. Golden and regeneration checks reject
source, schema, provenance, or output drift.

At runtime `src/lsp/semantic-catalog.ts` lazily loads profile-matched shards. The
key/value resolver uses the class or package selector—even when it follows the
optional argument—merges multiple selected package scopes, removes already-used
non-repeatable keys, inserts either a flag or `key=` snippet, and dispatches value
positions to enum, boolean, color, file, command, bibliography, font, and other typed
domains. Free-form/unknown values stay editable; this metadata is completion evidence,
not a validator.

### Revision-bound runtime completion evidence

Static source extraction cannot fully model TeX execution. After a normal pdfTeX pass,
the authored controller performs a read-only, bounded scan of the existing hash table
and standard LaTeX registries. It never runs TeX on behalf of completion and writes its
observations to a separate worker response field, so PDF, log, and auxiliary convergence
are unchanged. `src/engine/completion-snapshot.ts` combines those observations with the
engine recorder into the versioned `CompletionSnapshot` contract.

The snapshot identity covers the project-content revision, root, engine, TeX Live year,
and integrator-selected mirror/profile. `ProjectIndex` atomically replaces all runtime
fields. A source or topology mutation immediately marks them stale and removes their
candidates; the standalone LSP recomputes the project revision before accepting a new
snapshot. Project declarations have the highest precedence, fresh runtime observations
come next, and inferred static metadata comes last. XeLaTeX/LuaLaTeX return the same
schema with unsupported observation fields rather than pretending coverage.

The first-class color resolver combines active semantic shards, class/package options,
and `definecolor`/`providecolor`/`colorlet`/`definecolorset` declarations from the
current include graph. Later definitions deterministically replace earlier ones while
`providecolor` never clobbers an existing name. Direct color commands and color-valued
keys share the resolver. In an xcolor mix such as `red!50!blue`, only the color-name
segment at the cursor is replaced. Neutral candidates carry optional structured color
preview and provenance data that JSON-RPC and Monaco adapters preserve.

**Data & licensing.** The command database is wasmtex-authored (the snippet DB in `src/lsp/latex-commands.ts`); we intentionally do **not** bundle the GPL-licensed CWL corpus, so there are no redistribution constraints. Signatures are computed deterministically from those snippets (`parseSignature`), so the dataset is reproducible from source — no opaque generated blob. For the long tail beyond the bundled core, `src/lsp/package-shard-loader.ts` remains a backward-compatible host-supplied command-shard loader. Exact release semantics use the profile-bound semantic catalog above; neither path imports an external completion corpus.


For the SDK module boundary, see [architecture](architecture.md). Public contracts
and integration examples live in [the API reference](language-api.md#lsp-core) and
in [the integration guide](language-integration.md#standalone-lsp).
