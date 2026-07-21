# WTPDF adapter

WTPDF is WasmTex's small, independently designed C ABI between TeX engines and
a read-only PDF parser. It does not implement or emulate `pplib`'s public API,
names, data structures, or ownership rules.

ABI v2 retains the document and page operations used by XeTeX and implements the
first LuaHBTeX-facing core: roots, pages, indirect lookup, scalar values, ordered
arrays/dictionaries, reference resolution, and independent raw/decoded stream
readers. LuaHBTeX has not migrated yet. String lexical-form tracking,
authentication-after-open, decoded-output limits, and aggregate resource limits
remain required before the v2 contract below is complete. This is a behavioral
contract, not a set of aliases for another parser API.

| WTPDF operation | Current caller | Observable behavior to preserve |
| --- | --- | --- |
| file open/close | XeTeX `pdfimage.cpp` | open errors fail the image query; document resources are released on every path |
| memory open/close | unit tests; future LuaHBTeX | input bytes remain stable for the whole document lifetime |
| page count | XeTeX `pdf_count_pages` | invalid inputs report zero pages at the XeTeX boundary |
| five page boxes | XeTeX `pdf_get_rect` | one-based page selection, inherited attributes, TeX-point conversion in the caller |
| page rotation | XeTeX `pdf_get_rect` | normalized degrees and width/height swap at 90 or 270 degrees |
| PDF version/encryption | future LuaHBTeX | parser value and password outcome without rewriting the input PDF |

LuaHBTeX operations must preserve direct objects versus references,
object and generation numbers, integer versus real values, binary string bytes
and hex spelling, dictionary iteration order where exposed, and raw versus
decoded streams. The current v2 smoke test claims the implemented subset only.

## ABI v2 object model

ABI v2 adds three opaque handle kinds with explicit ownership:

- `wtpdf_value`: an owned view of one PDF value. It has a stable WTPDF kind and
  keeps scalar bytes or a backend object reference alive until destroyed.
- `wtpdf_stream_reader`: an owned, stateful cursor created from a stream value in
  raw or decoded mode. Readers never share cursor state.
- `wtpdf_document`: the existing document, extended with source identity,
  authentication state, object lookup, roots, and page references.

A value never exposes a backend pointer or layout. Every function returning a
value returns a new owned handle; callers destroy it exactly once. A document
must outlive all values and readers derived from it. Lua userdata must retain a
strong Lua reference to its document userdata so user code cannot close the
document while a child value remains reachable.

The stable value kinds are null, boolean, integer, real, string, name, array,
dictionary, stream, indirect reference, and none/error. Integer and real remain
distinct. Commands and lexer-only tokens are not document values and are not
exposed.

### Resolution and identity

Container lookup has two explicit modes:

- **preserve** returns the stored direct value or indirect reference without
  dereferencing it;
- **resolve** follows an indirect reference and returns its target value.

Reference values expose both object and generation numbers. Document lookup
accepts both numbers and never silently substitutes generation zero. Page
enumeration returns page reference identity as well as a resolved page
dictionary. Cycles are legal; conversion to a Lua table or serialized output
must use a caller-supplied depth/visited limit rather than recursively flattening
without bounds.

### Arrays and dictionaries

Array indices in WTPDF are zero-based. The Lua adapter performs the public API's
one-based conversion. Dictionary lookup accepts a byte key plus length; it does
not require NUL termination. Indexed dictionary iteration preserves the source
parser's entry order, because that order is observable through `pdfe` iteration.
Duplicate-key behavior must be captured by differential fixtures before release.

Dictionary and array access report missing/out-of-range separately from a
present PDF null. A resolved lookup that encounters an invalid reference reports
an error; it does not turn it into a successful null value.

### Names and strings

Name access returns decoded name bytes (including decoded `#xx` escapes) and a
length. Callers that serialize a name must escape those bytes for PDF output.

String access returns the exact semantic byte sequence and its length, including
embedded NUL bytes. It also returns whether the source token used literal or hex
syntax, because `pdfe` exposes that bit. Xpdf 4.04 normally discards this lexical
fact while parsing; the backend therefore needs a small, tracked Xpdf extension
or an equivalent side table before ABI v2 can claim string parity. Guessing from
the bytes or always reporting one form is not acceptable. Decoding a PDF string
for the optional Lua helper produces a separate owned byte buffer and never
mutates the original value.

### Streams

Every stream exposes its dictionary through the same dictionary API. A reader is
created in one of two modes:

- **raw**: bytes after PDF decryption but before declared stream filters;
- **decoded**: bytes after the declared filter and predictor chain.

Reader reset/close is explicit. Chunk reads report EOF separately from errors.
The convenience read-all operation requires a maximum output size; exceeding it
returns `WTPDF_STATUS_OUTPUT_TOO_LARGE`. The document open options also gain
maximum object depth, maximum decoded stream bytes, and maximum aggregate adapter
allocation. Defaults used by a production Worker must be finite.

### Authentication and document metadata

Opening an encrypted document without a password returns a live locked document
and `WTPDF_STATUS_ENCRYPTED`, not a half-usable value graph. Authentication may
reopen the same stored file or memory source with user and owner passwords, but
it is allowed only before child values/readers exist. Success invalidates no
public handle. Failure leaves the document locked.

Document queries expose PDF major/minor version, input byte size, xref object
count, page count, catalog, trailer, info dictionary, and page references. The
adapter's memory query reports adapter-owned bytes with a documented definition;
it must not present an approximation as the former parser's exact allocator
metric.

## LuaHBTeX caller map

| Caller | WTPDF v2 surface | Compatibility gate |
| --- | --- | --- |
| `image/pdftoepdf.c` | page dictionary, inherited resources, object/ref copy, stream raw/decode, authentication | `graphicx`, multipage import, xref/object stream, filters, encrypted input |
| `lua/lpdfelib.c` | document roots/metadata, all value kinds, ordered containers, references, strings, stream readers | normalized JSON for every `pdfe` method and userdata lifetime/error cases |
| `lua/lpdfscannerlib.c` | decoded stream reader and arrays of stream values | scanner token/operand fixtures and repeated reset/close |
| `image/epdf.h` | opaque document/value declarations only | compiler rejects all backend struct access |

The TeX Live patch must change these callers to WTPDF names and functions. It
must not provide a source-compatible header, typedef layer, struct layout, or
macro shim for the old parser.

## Licensing boundary

`wtpdf.h` and `wtpdf-xpdf.cc` are WasmTex-authored MIT-licensed source. The Xpdf
backend links to the TeX Live copy of Xpdf 4.04, which is offered under GPL v2 or
GPL v3. A linked engine artifact containing Xpdf is distributed under its
applicable GPL terms; the MIT notice for the adapter remains in the corresponding
source and notices.

## Ownership and lifetime

- File paths and passwords are borrowed only during an open call.
- Memory input is copied. The copy remains stable until the document is closed.
- A returned document owns the Xpdf `PDFDoc` and its stream. Call
  `wtpdf_document_close` exactly once; passing `NULL` is harmless.
- Returned strings are static and must not be freed.
- Xpdf's `GlobalParams` object is initialized lazily and intentionally retained
  for the lifetime of the engine Worker. The adapter is intended to be called on
  that Worker's engine thread, not concurrently from multiple threads.

## Errors and limits

Open calls return `NULL` and write a stable `wtpdf_status` when a status pointer
is supplied. Query functions return a status for invalid pages or outputs. Xpdf's
diagnostic output is not yet captured as structured warnings.

`max_input_bytes` provides a caller-selected input-size ceiling. A zero value
means no adapter-level ceiling for ABI v1. File sizes are checked with `stat` when
available; the host must still impose Worker memory and execution-time limits.
ABI v2 must add finite production defaults for recursion, decoded-stream, and
aggregate allocation before the Lua object API is production-ready.

## Page semantics

Pages are numbered from one. Xpdf resolves inherited page attributes. Its
effective box rules are MediaBox; CropBox falling back to MediaBox; and
BleedBox/TrimBox/ArtBox falling back to CropBox, with clipping performed by Xpdf.
Rotation is normalized to the range 0 through 359. Differential fixtures must
approve behavior for malformed PDFs where the former parser used a different
recovery rule.
