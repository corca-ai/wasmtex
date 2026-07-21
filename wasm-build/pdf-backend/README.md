# WTPDF adapter

WTPDF is WasmTex's small, independently designed C ABI between TeX engines and
a read-only PDF parser. It does not implement or emulate `pplib`'s public API,
names, data structures, or ownership rules.

The first ABI revision exposes only the document and page operations needed by
XeTeX. LuaHBTeX object, reference, dictionary, string, and stream operations must
be added as native WTPDF concepts before that engine can migrate.

| WTPDF operation | Current caller | Observable behavior to preserve |
| --- | --- | --- |
| file open/close | XeTeX `pdfimage.cpp` | open errors fail the image query; document resources are released on every path |
| memory open/close | unit tests; future LuaHBTeX | input bytes remain stable for the whole document lifetime |
| page count | XeTeX `pdf_count_pages` | invalid inputs report zero pages at the XeTeX boundary |
| five page boxes | XeTeX `pdf_get_rect` | one-based page selection, inherited attributes, TeX-point conversion in the caller |
| page rotation | XeTeX `pdf_get_rect` | normalized degrees and width/height swap at 90 or 270 degrees |
| PDF version/encryption | future LuaHBTeX | parser value and password outcome without rewriting the input PDF |

Future LuaHBTeX operations must preserve direct objects versus references,
object and generation numbers, integer versus real values, binary string bytes
and hex spelling, dictionary iteration order where exposed, and raw versus
decoded streams. Those guarantees are intentionally not claimed by ABI v1.

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
means no adapter-level ceiling. File sizes are checked with `stat` when available;
the host must still impose Worker memory and execution-time limits. Recursion,
decoded-stream, and aggregate-allocation limits are required before the future
Lua object API is production-ready.

## Page semantics

Pages are numbered from one. Xpdf resolves inherited page attributes. Its
effective box rules are MediaBox; CropBox falling back to MediaBox; and
BleedBox/TrimBox/ArtBox falling back to CropBox, with clipping performed by Xpdf.
Rotation is normalized to the range 0 through 359. Differential fixtures must
approve behavior for malformed PDFs where the former parser used a different
recovery rule.
