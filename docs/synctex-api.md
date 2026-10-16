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
