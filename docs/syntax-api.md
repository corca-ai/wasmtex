# Syntax API

For hosts sharing source snapshots across language and semantic tools. Start with the
[language integration recipe](language-integration.md); implementation details belong
in [language service architecture](language-service.md).

### Shared syntax lifecycle

Create one `LatexSyntaxService` when LaTeX language features and another semantic
consumer must observe the same parse. Pass it to `LatexLanguageService`, then use
stable `fileId` values across path moves:

```ts
import { LatexLanguageService } from 'wasmtex/lsp'
import { LatexSyntaxService } from 'wasmtex/syntax'

const syntax = new LatexSyntaxService()
const language = new LatexLanguageService({ syntaxService: syntax })
const snapshot = language.updateDocument({
  fileId: 'document-42',
  path: 'chapters/intro.tex',
  content: '$E = mc^2$',
  documentVersion: 7,
})
```

`snapshot` and all subsequent LSP queries are backed by the same `ProjectIndex`.
`moveDocument` and `removeDocument` preserve or retire the stable identity.
Markdown documents expose math regions plus ATX and setext section scopes, but
do not contribute LaTeX symbols to the project index. `getStats()` reports
parse passes for integration budgets.

Document Syntax Snapshot schema 8 is the singular source-preserving contract for
notation roots, visible prose, section/environment scopes, neutral source-order blocks,
declarations, macros, and includes. Blocks expose non-overlapping heading, paragraph,
display-math, list-item, table-row, caption, and glossary/acronym entry boundaries with
their revision-local parent scope. They intentionally do not classify discourse or
mathematical meaning. The notation arena uses revision-local numeric node IDs with
parent/child references and exact UTF-16 ranges. IDs are not stable across edits.
Malformed or unknown TeX remains representable through incomplete and opaque states;
`assertLatexSyntaxSchemaVersion` rejects incompatible wire versions explicitly.
`findLatexNotationPath(snapshot, offset)` returns the root-to-leaf arena path using
binary search over ordered source ranges. `getStats()` exposes parse, notation-node,
recovery, serialized-byte, last-invalidation, and last-transfer counters without
adding a serialized interval index. Counters that require serialization are computed
lazily when stats are requested.

`upsert(document, cancellationToken?)` accepts a token with a live
`isCancellationRequested` property. Cancellation throws `LatexSyntaxCancelledError`
before any partial file snapshot or project-index mutation becomes visible.

The CST preserves groups, consumed command arguments, scripts, delimiters,
alignments, nested environments, modifiers, styles, and explicit named operators.
For example, `\hat y` retains a modifier-to-nucleus path and
`\operatorname{ECE}` has one named surface covering each `ECE` character. In
contrast, `\mathrm{ECE}` is a style over three ordinary tokens and plain `ECE`
remains three juxtaposed tokens.

`MATH_COMMAND_SPECS` and `getMathCommandSpec(name)` expose the immutable neutral
command registry. A spec contains argument syntax and roles, optional single-token
consumption, TeX math class, star policy, structural/opaque/ignored expansion policy,
and exact or curated package provenance. The built-in families cover modifiers,
styles, named surfaces, fractions and roots, large operators, class overrides,
delimiters, multiscripts, layout choices, spacing/text, Unicode math styles, and
explicitly opaque package DSLs. These records describe TeX structure only; they do not
declare application, binders, derivatives, intervals, products, or domain meaning.

Each macro event carries bounded
definition and invocation source ranges plus an expansion outcome (`expanded`,
`cycle`, `truncated`, or `unresolved`). `editable: false` means the apparent
meaning is generated: consumers may navigate to its source but must not create
an automatic edit against a synthetic occurrence. Project inventory changes
relink definition ranges without reparsing unchanged callers.

Complete bounded expansions that have one compositional shape are lowered onto
the call-site CST node. Thus a declared operator and direct
`\operatorname`, or a project wrapper and its direct modifier/style form, use
the same node kinds while retaining different call/definition provenance.
Complete composite expansions expose a neutral generated-notation tree on the
macro event. Its nodes carry structure but no source ranges or editability; the
event's real call and definition ranges remain the only provenance. Dynamic,
cyclic, truncated, or structurally unsupported expansions stay opaque. Macro
events also expose the exact required and explicitly supplied optional
arguments at the invocation; omitted defaults remain declaration evidence
rather than fake source occurrences.

`getInvalidatedFiles()` returns the current snapshots whose syntax or
provenance changed in the latest inventory mutation. An ordinary leaf edit
returns only that file; adding, changing, moving, or removing a macro
definition additionally returns only callers of the affected macro names.
Hosts forward this explicit closure rather than retransmitting the project.

Structural declarations preserve the neutral source data needed downstream.
Operator declarations include their command name, displayed surface, limits
form, and separate source ranges. Paired delimiters retain both delimiters.
Macro declarations retain parameter count, optional default, and body when
statically complete. Glossary and acronym declarations retain key, short/long
forms, top-level fields/options (including plural and description fields), and
exact source ranges. Incomplete declarations remain local `incomplete`
records instead of invalidating the document.

The snapshot intentionally contains no mathematical application, binder, derivative,
interval, overloaded-operator, concept, law, pack, entity, or UI types. Downstream
semantic engines own those interpretations and may depend on WasmTex; the reverse
dependency is forbidden.
