# WTPDF adapter

WTPDF is WasmTex's small, independently designed C ABI between TeX engines and
a read-only PDF parser. It does not implement or emulate `pplib`'s public API,
names, data structures, or ownership rules.

ABI v3 retains the document and page operations used by XeTeX and implements the
LuaHBTeX-facing core: roots, pages, indirect lookup, scalar values, ordered
arrays/dictionaries, reference resolution, independent raw/decoded stream
readers, post-open authentication, and finite production limits. LuaHBTeX's
image inclusion, `pdfe`, and `pdfscanner` callers compile against this API. This
is a behavioral contract, not a set of aliases for another parser API.

| WTPDF operation | Current caller | Observable behavior to preserve |
| --- | --- | --- |
| file open/close | XeTeX `pdfimage.cpp` | open errors fail the image query; document resources are released on every path |
| memory open/close | unit tests; LuaHBTeX | input bytes remain stable for the whole document lifetime |
| page count | XeTeX `pdf_count_pages` | invalid inputs report zero pages at the XeTeX boundary |
| five page boxes | XeTeX `pdf_get_rect` | one-based page selection, inherited attributes, TeX-point conversion in the caller |
| page rotation | XeTeX `pdf_get_rect` | normalized degrees and width/height swap at 90 or 270 degrees |
| PDF version/encryption | LuaHBTeX | parser value and password outcome without rewriting the input PDF |

LuaHBTeX operations must preserve direct objects versus references,
object and generation numbers, integer versus real values, binary string bytes
and hex spelling, dictionary iteration order where exposed, and raw versus
decoded streams. The v3 smoke test covers classic xrefs, xref/object streams,
literal and hex strings, authentication, traversal/output/allocation limits,
malformed input, and handle cleanup. Product-level differential and
host-isolation tests remain separate release gates.

## ABI v3 object model

ABI v3 exposes three opaque handle kinds with explicit ownership:

- `wtpdf_value`: an owned view of one PDF value. It has a stable WTPDF kind and
  keeps scalar bytes or a backend object reference alive until destroyed.
- `wtpdf_stream_reader`: an owned, stateful cursor created from a stream value in
  raw or decoded mode. Readers never share cursor state.
- `wtpdf_document`: the existing document, extended with source identity,
  authentication state, object lookup, roots, and page references.

A value never exposes a backend pointer or layout. Every function returning a
value returns a new owned handle; callers destroy it exactly once. A close
request is deferred until all values and readers derived from the document are
released. Lua userdata also retains a strong Lua reference to its document
userdata so the public lifetime is explicit.

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
fact while parsing, so the tracked TeX Live patch records the bit on Xpdf
`Object` values at the lexer boundary and WTPDF exposes it through an enum.
Guessing from the bytes or always reporting one form is not acceptable. The Lua
adapter returns semantic bytes for decoded access and a canonical lexical
spelling for raw access; unusual but equivalent escape spelling can therefore
normalize without changing the string value.

### Streams

Every stream exposes its dictionary through the same dictionary API. A reader is
created in one of two modes:

- **raw**: bytes after PDF decryption but before declared stream filters;
- **decoded**: bytes after the declared filter and predictor chain.

Reader reset/close is explicit. Chunk reads report EOF separately from errors.
The convenience read-all operation requires a maximum output size; exceeding it
returns `WTPDF_STATUS_OUTPUT_TOO_LARGE`. Document open options also enforce
maximum object depth, maximum decoded stream bytes, and maximum aggregate adapter
allocation with finite defaults.

### Authentication and document metadata

Opening an encrypted document without a password returns a live locked document
and `WTPDF_STATUS_ENCRYPTED`, not a half-usable value graph. Authentication may
reopen the same stored file or memory source with user and owner passwords, but
it is allowed only before child values/readers exist. Success invalidates no
public handle. Failure leaves the document locked.

Document queries expose PDF major/minor version, input byte size, xref object
count, page count, catalog, trailer, info dictionary, and page references.
Catalog and info are dictionary queries: when the document carries no such
dictionary (an absent `/Info`, a corrupt root) they report
`WTPDF_STATUS_NOT_FOUND` with no value handle — matching the former parser's
NULL result — instead of returning a null-kind value. The
adapter's memory query reports adapter-owned bytes with a documented definition;
it must not present an approximation as the former parser's exact allocator
metric.

## LuaHBTeX caller map

| Caller | WTPDF v3 surface | Compatibility gate |
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

- File paths and memory input are copied so the same source can be reopened for
  post-open authentication. Passwords are borrowed only during a call.
- A returned document owns the Xpdf `PDFDoc` and its stream. Call
  `wtpdf_document_close` exactly once; passing `NULL` is harmless. Destruction is
  deferred while child handles remain live.
- Name and string byte pointers are borrowed from their value handle and remain
  valid only until that value is destroyed.
- Xpdf's `GlobalParams` object is initialized lazily and intentionally retained
  for the lifetime of the engine Worker. The adapter is intended to be called on
  that Worker's engine thread, not concurrently from multiple threads.

## Errors and limits

Open calls return `NULL` and write a stable `wtpdf_status` when a status pointer
is supplied. Query functions return a status for invalid pages or outputs. Xpdf's
diagnostic output is not yet captured as structured warnings.

`wtpdf_open_options_init()` installs finite defaults: 256 MiB input, 256 levels
of public object traversal, 256 MiB of decoded bytes per stream reader, and
512 MiB of adapter-owned allocations. A caller can lower a limit or explicitly
set it to zero to disable that adapter-level check. File sizes are checked with
`stat` when available. `max_adapter_bytes` counts the WTPDF document, retained
input/path, and WTPDF value/reader handles; it deliberately does not claim to
measure opaque Xpdf allocations or caller-owned Lua buffers.

The traversal limit applies to values returned through WTPDF. It is not an Xpdf
parser-recursion sandbox. The engine Worker or process must therefore also have
an independent wall-clock timeout and memory ceiling, and the host must be able
to terminate it after malformed or adversarial input.

## Page semantics

Pages are numbered from one. Xpdf resolves inherited page attributes. Its
effective box rules are MediaBox; CropBox falling back to MediaBox; and
BleedBox/TrimBox/ArtBox falling back to CropBox, with clipping performed by Xpdf.
Rotation is normalized to the range 0 through 359. Differential fixtures must
approve behavior for malformed PDFs where the former parser used a different
recovery rule.
