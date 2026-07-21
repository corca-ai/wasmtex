// Public SyncTeX / preview API entry (#145) for embedding hosts that render their **own**
// PDF viewer (pdf.js) with forward/inverse search. Exposes the parser plus the
// engine-agnostic `TextMapper` fallback used when a document ships no SyncTeX data — so a
// host no longer has to deep-import `wasmtex/src/synctex/*`.

export type { SynctexData, SynctexNode } from './synctex/synctex-parser'
export { normalizeSynctexInputName, SynctexParser } from './synctex/synctex-parser'
export type { PdfLocation, SourceLocation } from './synctex/text-mapper'
export { TextMapper } from './synctex/text-mapper'
