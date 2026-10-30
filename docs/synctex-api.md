# SyncTeX and custom viewer API

For hosts rendering their own PDF. Use the [compiler API](compiler-api.md) to obtain
a compile result, or use the built-in [PdfViewer](api.md#pdfviewer-api).

## SyncTeX (`wasmtex/synctex`)

Parse the engine's SyncTeX output and map between PDF positions and source
locations — for hosts that render the PDF themselves (the built-in `PdfViewer`
already uses this internally). `CompileResult.synctex` holds the raw bytes.

```ts
import { SynctexParser } from 'wasmtex/synctex'

const parser = new SynctexParser()
// Prefer merged data for an incremental PDF; otherwise parse raw/gzipped bytes.
const data = result.synctexData ?? (result.synctex ? await parser.parse(result.synctex) : null)
if (data) {
  const regions = parser.forwardLookupAll(data, 'main.tex', 12)
  const source = parser.inverseLookup(data, 1, 100, 200)
  // Paint regions, or navigate to source?.file and source?.line.
}
```

`parse(bytes, { signal })` accepts an optional AbortSignal for a superseded
output revision. Raw text shorter than 256 Ki UTF-16 code units is parsed in the same
task after decoding. Larger inputs scan records in chunks, returning execution
to the host between roughly 4 ms slices; this is a cooperative target, not a
hard deadline for decoding, allocation or an individual record. Parsing keeps
one result tree and the existing synchronous lookup API, without a Worker
startup or copying the tree across threads. `parseText(text)` remains fully
synchronous. Retire a stale parse with its signal and fence publication against
the displayed PDF revision.

`parser.forwardLookup(data, file, line)` returns the primary PDF region for
hosts that paint one marker. Use `forwardLookupAll(data, file, line)` to preserve
every distinct region. A single source line can map to separated boxes, such as the
bottom of the left column and the top of the right column in a two-column document;
combining those boxes into one bounding rectangle would cover unrelated page content.
The built-in viewer paints all returned regions.

| Export | Purpose |
|--------|---------|
| `SynctexParser` | Parses raw (or gzipped) `.synctex` bytes into `SynctexData`. |
| `TextMapper` | Approximate text-based fallback using renderer text extraction and source text, independent of SyncTeX. |
| `normalizeSynctexInputName` | Normalizes an input path as SyncTeX records it (for matching project files). |
| `SynctexData` / `SynctexNode` / `PdfLocation` / `SourceLocation` | Result/coordinate types. |
| `TextMapperPage` / `TextMapperItem` | Minimal text extraction and coordinate conversion contract for any PDF renderer; no PDF.js dependency. |

## Detailed queries and source filtering

`inverseLookupDetailed(data, page, x, y, options?)` returns a plain record or
`null`. `source` includes the normalized input file, 1-based line, and an optional
positive engine column. `region` is the selected node's geometry; `container` is
the local search box, or `null` for a page-wide fallback. `nodeType` identifies
boxes, kerns and markers. `method` records the search route (`bracket`,
`container`, `nearest-child` or `nearest-node`). The result contains no tree
references and can be serialized.

`distance` is the geometric L1 distance to `region`, in scale-one PDF points.
`match` is `contains` when that distance is zero, otherwise `nearby`. These fields
are not confidence scores. SyncTeX boxes can include whitespace, and glue/math
markers have zero width. Hosts should combine these results with their renderer's
text hit testing before treating a click as visible text. Signed kern regions span
from the recorded after-move position back across the kern; parentless markers
remain points.

`forwardLookupDetailed(data, file, line, options?)` returns `source` with the actual
matched file/line, `requestedLine`, `match` (`exact` or `nearby`), and `regions`.
It preserves the earliest-page and disjoint-region behavior of `forwardLookupAll`,
including the existing search within three lines of the request. This lets a host
distinguish an exact source match from a neighboring-line approximation.

Both detailed methods accept an optional pure `acceptSource(source)` predicate:

```ts
const match = parser.inverseLookupDetailed(data, page, x, y, {
  acceptSource: ({ file, line }) => projectSources.has(file) && line > 0,
})
```

Rejected sources are never returned. A filter can cause inverse search to choose
a more distant accepted source, or return `null` if none is available. Forward
filtering evaluates the actual candidate line during the existing nearby-line
search. Hosts remain responsible for matching engine paths to project files and
checking source bounds against the compiled source snapshot. Without a filter,
the selected results are unchanged. The legacy methods retain their return shapes;
`inverseLookup` continues to return only `{ file, line }`.

## Text matching fallback

`TextMapper` takes no constructor arguments and does not consume `SynctexData`.
Register source text and index renderer pages first:

```ts
import { TextMapper } from 'wasmtex/synctex'

const mapper = new TextMapper()
mapper.setSources([['main.tex', mainSource]])
await mapper.indexPage(rendererPage, 1) // TextMapperPage; for example a PDF.js page
const source = mapper.lookup(1, 100, 200)
const region = mapper.forwardLookup('main.tex', 12)
```

Pages and source lines are 1-based. Lookup coordinates are at scale one with a
top-left origin; undo viewer zoom before passing a click. Text matching is
approximate and does not reliably locate math, tables or figures. Replace sources
with `setSources()` after file removal/rename to avoid matching stale paths.

## Source-preserving text candidates

`VisibleTextIndex` is an opt-in alternative to `TextMapper`. Build a projection
from the exact source and its existing schema-8 syntax snapshot, then register
renderer text with original UTF-16 extraction offsets:

```ts
import { projectVisibleTextSource, VisibleTextIndex } from 'wasmtex/synctex'

const index = new VisibleTextIndex()
index.setSources([projectVisibleTextSource(compiledSource, compiledSyntax)])
index.setPage({
  page: 1,
  text: extractedText,
  rangeRects: (start, end) => rendererRangeRects(start, end),
})
const sources = index.findSources('Introduction to Linear Algebra')
const fragments = index.sourceFragments(compiledSyntax.fileId, compiledCaretOffset)
const regions = fragments.flatMap(({ text }) => index.findPdf(text).candidates)
```

The host owns compilation identity, source/SyncTeX validation and candidate
selection. Replacing sources retires old paths; clear pages when the displayed
compile changes. PDF coordinates use the same scale-one, top-left convention as
`TextMapper`. The adapter returns separate line/run rectangles rather than a
single bounding rectangle spanning columns. A callback must remain usable while
its page is indexed; release renderer leases after clearing/replacing that page.

Source candidates carry file identity/path/version, original UTF-16 range,
1-based line/column, neutral structural range and block kind. Projection retains
common formatting arguments, metadata, headings, captions and footnotes, plus
Unicode compatibility/ligature and whitespace normalization. Unknown grammars,
math and verbatim stay opaque. Arbitrary TeX macros are never executed. A
projection describes potential visible source text; it does not prove that a
metadata declaration or conditional branch was printed.

Both directions return all admitted matches, including repeated occurrences.
A substring is a partial-block match; the index does not choose the first
occurrence. Optional `contextBefore`/`contextAfter` expose matching character
counts (up to 128), not probabilities. Queries shorter than four normalized
UTF-16 units return no candidates. Hosts should additionally require sufficient
phrase length, uniqueness or structural/SyncTeX evidence before navigating.

PDF line-end hyphens are retained while joining the following line. Optional
`findPdf(text, { dehyphenate: true })` tries removing them only when there is no
literal match; candidates label this route `dehyphenated`. Source and PDF offsets
always address the original strings, including removed hyphens and style braces.

Preparation is bounded: source projection defaults to one million source units,
100,000 tokens, 4,096 syntax blocks and 2,048 special fields. The index retains at
most eight recently registered PDF pages, 250,000 extraction units per page and
2 million normalized units / 8,192 entries per catalog. Trigram dictionaries and
postings are capped at 32,768 and 200,000. Queries use a prebuilt trigram bucket,
inspect at most 256 entries and return at most 32 matches by default (configurable
up to 64). `truncated` means admission/search was incomplete; never interpret a
single returned candidate as proof of uniqueness then. Page eviction bounds the
search to registered pages, so even a complete result does not establish
uniqueness across an unindexed PDF. Preparation belongs at snapshot/page changes,
not in every caret callback; query text is capped at 512 normalized units.
