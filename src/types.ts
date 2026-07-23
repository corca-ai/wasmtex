export interface CompileResult {
  success: boolean
  pdf: Uint8Array | null
  log: string
  errors: TexError[]
  /** Time in milliseconds */
  compileTime: number
  /** Raw synctex data (uncompressed or gzipped) from pdfTeX -synctex=1 */
  synctex: Uint8Array | null
  /** Parsed SyncTeX, when the engine can provide it directly (#99): an incremental fast-path
   *  compile carries `synctex: null` (the tail is compiled in isolation) but sets `synctexData`
   *  to the tail SyncTeX **spliced** onto the last full compile's head — exact for the spliced
   *  PDF. Consume this in preference to parsing `synctex` yourself: `synctexData ?? parse(synctex)`. */
  synctexData?: import('./synctex/synctex-parser').SynctexData | null
  /** Raw .fmt format file data (if built during this session) */
  format?: Uint8Array | undefined
  /** Whether a cached preamble format was used for this compilation */
  preambleSnapshot?: boolean
  /** Whether the preamble `.fmt` cache was rebuilt during this compilation */
  preambleRebuilt?: boolean
  /** Control sequences from pdfTeX hash table (package + user commands) */
  engineCommands?: string[]
  /** Input files discovered by the TeX engine's `-recorder` (`.fls`). Includes project and
   *  system paths; use `telemetry.dependencyManifest.projectInputs` for the
   *  normalized, project-only invalidation boundary. */
  inputFiles?: string[]
  /** Whether `inputFiles` covers every recorder-enabled phase that contributed to
   *  this result (including a reused preamble snapshot). Absent means unproven,
   *  which preserves safety with older worker assets. */
  inputFilesComplete?: boolean
  /** Raw .trace file content from semantic trace hooks */
  semanticTrace?: string
  /** Fonts that lack glyphs for characters the document actually uses. Present
   *  (non-empty) means the compile "succeeded" but renders some characters as blank
   *  .notdef boxes — e.g. a Japanese font set for Korean text. A host can surface
   *  this even though `success` is true and no `errors` entry flips it. Headless:
   *  data only; the host decides how to warn / overlay. */
  glyphCoverage?: GlyphCoverageReport
  /** Structured, machine-readable engine telemetry (#54). The evolving superset of
   *  `errors`/`glyphCoverage`: every diagnostic carries a stable `code` a host can
   *  branch on. `errors`/`glyphCoverage` are kept for back-compat. (Geometry +
   *  dependency-graph pillars land in later increments.) */
  telemetry?: EngineTelemetry
}

/** Stable, machine-readable classification of a compile diagnostic (#54). A host
 *  branches on `code` rather than scraping messages. Many of these are "compile
 *  succeeded but output is wrong/incomplete" signals (`missing-glyph`,
 *  `undefined-reference`, `rerun-needed`) that `success: true` hides. */
export type DiagnosticCode =
  | 'tex-error' // generic `! ...` TeX error
  | 'package-error' // `Package X Error: ...`
  | 'missing-package' // a .sty/.cls not on the mirror
  | 'font-not-found' // a font entirely absent
  | 'missing-glyph' // font present but lacks glyphs the document uses (see `glyph`)
  | 'undefined-reference' // `\ref`/`\label` not resolved
  | 'undefined-citation' // `\cite` key not resolved
  | 'rerun-needed' // labels changed — another pass is required
  | 'overfull-box'
  | 'package-warning'
  | 'latex-warning'

export interface Diagnostic {
  code: DiagnosticCode
  severity: 'error' | 'warning' | 'info'
  message: string
  file?: string
  line?: number
  /** Structured detail for `missing-glyph` (the affected font + characters). */
  glyph?: FontGlyphGap
}

export interface EngineTelemetry {
  diagnostics: Diagnostic[]
  /** Page/box geometry parsed from the engine's intermediate output (XeTeX's XDV),
   *  when available (#54 slice 3). The substrate a host needs for text extraction,
   *  click-to-source, content cropping, and figure/equation overlays — all headless,
   *  data only. Present only for the XeLaTeX path (the only one emitting XDV). */
  geometry?: DocumentGeometry
  /** What this compile depended on — the file/package/font dependency graph
   *  (#54 slice 4). The substrate for exact cache invalidation and incremental
   *  compile. Derived from the log (every engine), enriched with the TeX engine's
   *  `.fls` recorder, XDV fonts (XeLaTeX), and the source's `\usepackage`/`\input`. */
  dependencies?: DependencyGraph
  /** Sound, project-only invalidation boundary for the rendered result. Unlike the
   *  richer best-effort graph, `complete: true` is a correctness guarantee: a host
   *  may reuse the result when no listed project input changed (and its compile
   *  profile/root/topology are unchanged). Produced by the headless orchestrator,
   *  which can combine engine recorder data with auxiliary-stage requests. */
  dependencyManifest?: DependencyManifest
}

export type DependencyManifestStage = 'latex' | 'bibliography' | 'index' | 'pdf-conversion'

export type DependencyManifestSource = 'recorder' | 'backend-request' | 'log' | 'source' | 'xdv'

export type DependencyManifestIncompleteReason =
  | 'compile-failed'
  | 'recorder-unavailable'
  | 'engine-recorder-unavailable'
  | 'pdf-conversion-recorder-unavailable'
  | 'incremental-dependencies-unavailable'
  | 'auxiliary-stage-failed'

export interface DependencyManifestCoverage {
  stage: DependencyManifestStage
  source: DependencyManifestSource
  /** True only when this observation is authoritative for every project input
   *  consumed by the stage. */
  complete: boolean
}

/**
 * Versioned, normalized project-input contract for safe host-side reuse.
 *
 * `complete` is deliberately binary, not a confidence score. A host must treat
 * an absent/incomplete manifest conservatively and compile again.
 */
export interface DependencyManifest {
  version: 1
  root: string
  projectInputs: string[]
  complete: boolean
  coverage: DependencyManifestCoverage[]
  incompleteReason?: DependencyManifestIncompleteReason
}

/** A node in the compile dependency graph: a file/package/font the compile touched. */
export interface DependencyNode {
  /** Normalized path or name — the graph key (e.g. `amsmath.sty`, `chapters/intro.tex`). */
  id: string
  kind: 'tex' | 'class' | 'package' | 'font' | 'image' | 'bib' | 'other'
  /** `project` = a file in the user's project; `system` = from the bundled mirror. */
  origin: 'project' | 'system'
  /** How this node was discovered — `log` (engine output), `fls` (TeX recorder),
   *  `xdv` (XeTeX font defs), `source` (`\usepackage`/`\input` scan). May be several. */
  discoveredBy: Array<'log' | 'fls' | 'xdv' | 'source'>
}

export interface DependencyEdge {
  /** Parent node id (e.g. `main.tex`). */
  from: string
  /** Child node id (e.g. `amsmath.sty`). */
  to: string
  relation: 'includes' | 'loads' | 'uses-font' | 'reads'
  discoveredBy: Array<'log' | 'fls' | 'xdv' | 'source'>
}

export interface DependencyGraph {
  nodes: DependencyNode[]
  edges: DependencyEdge[]
  /** The document root (first file opened — usually the main `.tex`), if known. */
  root?: string
}

/** An axis-aligned box in PDF points (bp), measured from the page's TOP-LEFT corner
 *  (x → right, y → down). */
export interface BoxGeometry {
  x: number
  y: number
  width: number
  height: number
}

/** One positioned text run (a single XDV glyph run). Coordinates in bp from the page
 *  top-left; `x`/`y` are the run's origin (left edge, baseline). Glyph heights are not
 *  available headlessly (no font metrics), so a host approximates the vertical extent
 *  from `size`. */
export interface TextRun {
  x: number
  y: number
  /** Advance width of the run (bp). */
  width: number
  /** Font point size (bp). */
  size: number
  /** Number of glyphs in the run. */
  glyphs: number
  /** The run's original Unicode text, when XeTeX emitted it (XDV_TEXT_AND_GLYPHS).
   *  Absent for plain glyph runs that carry no text. */
  text?: string
  /** Font file name the run was set in, when known. */
  font?: string
}

export interface PageGeometry {
  /** Page number (`\count0` from the page's bop). */
  page: number
  /** Media-box width/height in bp, from a `papersize` special; absent if the document
   *  didn't emit one (the host then falls back to the PDF's own page size). */
  width?: number
  height?: number
  /** Tight bounding box of all placed content (bp from page top-left). Vertical text
   *  extent is approximated from font size; absent on an empty page. */
  contentBox?: BoxGeometry
  /** Positioned text runs in document order. */
  textRuns: TextRun[]
  /** Rules (`\hrule`/`\vrule`, table/figure borders, fraction bars), exact extents. */
  rules: BoxGeometry[]
}

export interface DocumentGeometry {
  pages: PageGeometry[]
  /** False if the DVI cursor could have desynced (traditional TFM `set_char` text is
   *  present, whose advance needs font metrics we don't have); positions are then
   *  unreliable. Native-font docs (XeLaTeX fontspec/xeCJK) parse exactly. */
  reliable: boolean
}

/** A character the chosen font has no glyph for (renders as a blank .notdef box). */
export interface GlyphMiss {
  /** Unicode codepoint with no glyph in the font. */
  codepoint: number
  /** Source location, when recoverable. */
  source?: { line: number; column?: number }
  /** Output (PDF) placement of the .notdef box — the metadata a host needs to draw
   *  a preview overlay. Populated only when the engine emits glyph positions (see the
   *  glyph-coverage roadmap); absent when derived from the log alone. */
  output?: { page: number; x: number; y: number; width?: number; height?: number }
}

/** One font missing glyphs the document uses, with the affected characters. */
export interface FontGlyphGap {
  /** Font name XeTeX/kpathsea reported the missing glyph for. */
  font: string
  /** Dominant Unicode script of the missing characters (e.g. `'Hangul'`), if detected. */
  script?: string
  /** Distinct missing codepoints, ascending. */
  codepoints: number[]
  /** Total missing-character occurrences (≥ codepoints.length). */
  count: number
  /** A few of the missing characters, for display (e.g. `'안녕하…'`). */
  sample: string
  /** Per-occurrence detail (overlay metadata); present only when positions exist. */
  occurrences?: GlyphMiss[]
  /** Fonts on the mirror that DO cover this script — populated by the coverage
   *  helper so a host can offer a one-click substitute. */
  suggestions?: string[]
}

export interface GlyphCoverageReport {
  gaps: FontGlyphGap[]
}

export interface TexError {
  line: number
  message: string
  severity: 'error' | 'warning'
  file?: string
  /** Machine-readable classification for select errors so a host can branch
   *  (rather than regex the message). Currently: `'missing-package'` — a `.sty`/
   *  `.cls` not found on the bundled mirror (vs a generic document error). */
  code?: string
}

export interface VirtualFile {
  path: string
  content: string | Uint8Array
  modified: boolean
}

export type EngineStatus = 'unloaded' | 'loading' | 'ready' | 'compiling' | 'error'

export type AppStatus = EngineStatus | 'rendering'

/** Supported TeX Live versions. */
export type TexliveVersion = '2025'

// --- Warmup / preload types ---

export interface TexliveFileEntry {
  format: number
  filename: string
}

export interface CachedTexliveFile {
  format: number
  filename: string
  data: ArrayBuffer
}

export interface WarmupCache {
  files: CachedTexliveFile[]
  notFound: TexliveFileEntry[]
  bloomFilter?: ArrayBuffer
}
