import type { ProjectIndex } from './project-index'

export interface Diagnostic {
  file: string
  line: number
  column: number
  endColumn: number
  message: string
  severity: 'error' | 'warning' | 'info'
  code: string
}

/** Compute static analysis diagnostics from project index */
export function computeDiagnostics(index: ProjectIndex): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  findUndefinedRefs(index, diagnostics)
  findUndefinedCitations(index, diagnostics)
  findUnusedBibEntries(index, diagnostics)
  findDuplicateLabels(index, diagnostics)
  findUnreferencedLabels(index, diagnostics)
  findMissingIncludes(index, diagnostics)
  findEngineOnlyLabels(index, diagnostics)
  return diagnostics
}

/** Flag `.bib` entries that are never cited (info). */
function findUnusedBibEntries(index: ProjectIndex, out: Diagnostic[]): void {
  const bibEntries = index.getBibEntries()
  if (bibEntries.length === 0) return

  const cited = new Set<string>(index.getAuxCitations())
  for (const file of index.getFiles()) {
    const symbols = index.getFileSymbols(file)
    if (!symbols) continue
    for (const cite of symbols.citations) cited.add(cite.key)
  }

  // `\nocite{*}` cites every entry, so nothing is unused.
  if (cited.has('*')) return

  for (const entry of bibEntries) {
    if (cited.has(entry.key)) continue
    out.push({
      file: entry.location.file,
      line: entry.location.line,
      column: entry.location.column,
      endColumn: entry.location.column + entry.key.length,
      message: `Unused bibliography entry '${entry.key}'`,
      severity: 'info',
      code: 'unused-bib-entry',
    })
  }
}

function findUndefinedRefs(index: ProjectIndex, out: Diagnostic[]): void {
  const definedLabels = new Set(index.getAllLabels().map((l) => l.name))
  const auxLabels = index.getAuxLabels()
  const trace = index.getSemanticTrace()

  for (const file of index.getFiles()) {
    const symbols = index.getFileSymbols(file)
    if (!symbols) continue
    for (const ref of symbols.labelRefs) {
      if (trace?.labels.has(ref.name)) continue // macro-generated label → no false positive
      if (!definedLabels.has(ref.name) && !auxLabels.has(ref.name)) {
        out.push({
          file,
          line: ref.location.line,
          column: ref.location.column,
          endColumn: ref.location.column + ref.name.length, // covers the name; column is the name start
          message: `Undefined reference '${ref.name}'`,
          severity: 'warning',
          code: 'undefined-ref',
        })
      }
    }
  }
}

/** All `\bibitem` keys declared across the project. */
function collectBibitemKeys(index: ProjectIndex): Set<string> {
  const keys = new Set<string>()
  for (const file of index.getFiles()) {
    const symbols = index.getFileSymbols(file)
    if (!symbols) continue
    for (const item of symbols.bibItems) keys.add(item.key)
  }
  return keys
}

function findUndefinedCitations(index: ProjectIndex, out: Diagnostic[]): void {
  const auxCitations = index.getAuxCitations()
  const bibKeys = new Set(index.getBibEntries().map((e) => e.key))
  const bibitemKeys = collectBibitemKeys(index)

  for (const file of index.getFiles()) {
    const symbols = index.getFileSymbols(file)
    if (!symbols) continue
    for (const cite of symbols.citations) {
      if (cite.key === '*') continue // `\nocite{*}` wildcard, never an undefined citation
      const defined =
        auxCitations.has(cite.key) || bibKeys.has(cite.key) || bibitemKeys.has(cite.key)
      if (defined) continue
      out.push({
        file,
        line: cite.location.line,
        column: cite.location.column,
        endColumn: cite.location.column + cite.key.length, // covers the key; column is the key start
        message: `Undefined citation '${cite.key}'`,
        severity: 'warning',
        code: 'undefined-cite',
      })
    }
  }
}

function findDuplicateLabels(index: ProjectIndex, out: Diagnostic[]): void {
  const allLabels = index.getAllLabels()
  const seen = new Map<string, { file: string; line: number }>()

  for (const label of allLabels) {
    const prev = seen.get(label.name)
    if (prev) {
      out.push({
        file: label.location.file,
        line: label.location.line,
        column: label.location.column,
        endColumn: label.location.column + label.name.length, // covers the name; column is the name start
        message: `Duplicate label '${label.name}' (first defined at ${prev.file}:${prev.line})`,
        severity: 'warning',
        code: 'duplicate-label',
      })
    } else {
      seen.set(label.name, { file: label.location.file, line: label.location.line })
    }
  }
}

function findUnreferencedLabels(index: ProjectIndex, out: Diagnostic[]): void {
  const refdNames = new Set<string>()
  for (const file of index.getFiles()) {
    const symbols = index.getFileSymbols(file)
    if (!symbols) continue
    for (const ref of symbols.labelRefs) refdNames.add(ref.name)
  }
  const trace = index.getSemanticTrace()
  if (trace) {
    for (const ref of trace.refs) refdNames.add(ref)
  }
  for (const label of index.getAllLabels()) {
    if (!refdNames.has(label.name)) {
      out.push({
        file: label.location.file,
        line: label.location.line,
        column: label.location.column,
        endColumn: label.location.column + label.name.length, // covers the name; column is the name start
        message: `Label '${label.name}' is never referenced`,
        severity: 'info',
        code: 'unreferenced-label',
      })
    }
  }
}

/**
 * Candidate paths an `\input`/`\include` target resolves to: the raw path, plus `<path>.tex`
 * ONLY when the target is extensionless. \input loads the EXACT file with whatever extension
 * is given, so forcing `.tex` onto e.g. `macros.sty` falsely searches `macros.sty.tex`.
 * Mirrors go-to-definition's resolveInput and the link provider's `/\.[^./]+$/` check.
 */
function includeCandidates(path: string): string[] {
  return /\.[^./]+$/.test(path) ? [path] : [path, `${path}.tex`]
}

/** Whether an include target resolves against the project root or the including file's dir. */
function isIncludeResolved(index: ProjectIndex, path: string, dir: string): boolean {
  return includeCandidates(path).some(
    (c) => !!(index.getFileSymbols(c) || (dir && index.getFileSymbols(dir + c))),
  )
}

function findMissingIncludes(index: ProjectIndex, out: Diagnostic[]): void {
  for (const file of index.getFiles()) {
    const symbols = index.getFileSymbols(file)
    if (!symbols) continue
    const lastSlash = file.lastIndexOf('/')
    const dir = lastSlash >= 0 ? file.slice(0, lastSlash + 1) : ''
    for (const inc of symbols.includes) {
      if (isIncludeResolved(index, inc.path, dir)) continue
      // Show the actual searched name: the raw path when it carries an extension, else the
      // `.tex`-suffixed form we looked for.
      const displayTarget = /\.[^./]+$/.test(inc.path) ? inc.path : `${inc.path}.tex`
      out.push({
        file,
        line: inc.location.line,
        column: inc.location.column,
        // column sits at the backslash; cover `\<cmd>{` (= type.length + 2) + the path.
        endColumn: inc.location.column + inc.type.length + 2 + inc.path.length,
        message: `Included file '${displayTarget}' not found in project`,
        severity: 'warning',
        code: 'missing-include',
      })
    }
  }
}

function findEngineOnlyLabels(index: ProjectIndex, out: Diagnostic[]): void {
  const trace = index.getSemanticTrace()
  if (!trace) return
  // Anchor these to a real source file at a valid 1-based position. The label exists in the
  // semantic trace but not in static source, so there is no exact parsed location; anchoring to
  // the first project file keeps the marker path from dropping it (it groups to a real Monaco
  // model) and honors the 1-based contract every other diagnostic follows (old '?'/0/0 broke both).
  const anchorFile = index.getFiles()[0]
  if (!anchorFile) return
  const staticLabels = new Set(index.getAllLabels().map((l) => l.name))
  // Collect all static refs to skip referenced engine-only labels
  const staticRefs = new Set<string>()
  for (const file of index.getFiles()) {
    const symbols = index.getFileSymbols(file)
    if (!symbols) continue
    for (const ref of symbols.labelRefs) staticRefs.add(ref.name)
  }
  for (const key of trace.labels) {
    if (staticLabels.has(key) || index.getAuxLabels().has(key)) continue
    if (staticRefs.has(key) || trace.refs.has(key)) continue // referenced → not a problem
    out.push({
      file: anchorFile,
      line: 1,
      column: 1,
      endColumn: 1,
      message: `Label '${key}' defined by macro expansion (not visible in source)`,
      severity: 'info',
      code: 'engine-only-label',
    })
  }
}
