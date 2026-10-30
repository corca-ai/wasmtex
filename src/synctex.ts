// Public SyncTeX / preview API entry (#145) for embedding hosts that render their **own**
// PDF viewer with forward/inverse search. Exposes the parser plus the
// engine-agnostic `TextMapper` fallback used when a document ships no SyncTeX data — so a
// host no longer has to deep-import `wasmtex/src/synctex/*`.

export type { SynctexData, SynctexNode, SynctexParseOptions } from './synctex/synctex-parser'
export { normalizeSynctexInputName, SynctexParser } from './synctex/synctex-parser'
export type {
  SynctexForwardMatch,
  SynctexInverseMatch,
  SynctexLookupOptions,
  SynctexSourceLocation,
} from './synctex/synctex-query-result'
export type {
  PdfLocation,
  SourceLocation,
  TextMapperItem,
  TextMapperPage,
} from './synctex/text-mapper'
export { TextMapper } from './synctex/text-mapper'
export type { VisibleTextQueryOptions } from './synctex/visible-text-catalog'
export type {
  VisibleTextIndexResult,
  VisibleTextPdfMatch,
  VisibleTextPdfPage,
  VisibleTextSourceMatch,
} from './synctex/visible-text-index'
export { VisibleTextIndex } from './synctex/visible-text-index'
export type { NormalizedVisibleText } from './synctex/visible-text-normalize'
export type {
  VisibleTextSourceBlock,
  VisibleTextSourceProjection,
} from './synctex/visible-text-source'
export { projectVisibleTextSource } from './synctex/visible-text-source'
