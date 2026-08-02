import { parseAuxFile } from './aux-parser'
import { parseLatexFile } from './latex-parser'
import type { SemanticTrace } from './trace-parser'
import type {
  AuxData,
  BibEntry,
  BibitemDef,
  BibStringDef,
  CitationRef,
  ColorDefinition,
  CommandDef,
  CommandUse,
  EnvironmentUse,
  FileSymbols,
  LabelDef,
  LabelRef,
  ParsedBibFile,
  ProjectKeyDefinition,
  ProjectValue,
  SourceLocation,
} from './types'

export interface EngineCommandInfo {
  name: string
  eqType: number // -1 = unknown (old WASM), 0+ = pdfTeX eq_type
  argCount: number // -1 = unknown/not-macro, 0-9 = argument count
  category: 'macro' | 'primitive' | 'unknown'
}

export interface ProjectIndexStats {
  sourceFiles: number
  bibliographyFiles: number
  latexSymbols: number
  bibliographyEntries: number
  bibliographyStrings: number
  /** Deterministic UTF-16 payload estimate for retained semantic index records. */
  estimatedBytes: number
}

/** Suffixes that match `end<X>` but are NOT real environments */
const ENV_BLOCKLIST = new Set(['csname', 'group', 'input', 'linechar', 'write'])

/** LaTeX3 (expl3) internal markers — `_` and `:` are only catcode-11
 *  inside expl3 code. No user-facing command contains them. */
const L3_INTERNAL_RE = /[_:]/

function classifyEqType(eqType: number): EngineCommandInfo['category'] {
  if (eqType >= 111 && eqType <= 118) return 'macro'
  if (eqType > 0) return 'primitive'
  return 'unknown'
}

function parseEngineEntry(entry: string): EngineCommandInfo {
  const tab = entry.indexOf('\t')
  if (tab < 0) return { name: entry, eqType: -1, argCount: -1, category: 'unknown' }
  const name = entry.slice(0, tab)
  const rest = entry.slice(tab + 1)
  const tab2 = rest.indexOf('\t')
  if (tab2 < 0) {
    // 2-column: name\teqType (backward compat with old WASM)
    const eqType = parseInt(rest, 10)
    if (Number.isNaN(eqType)) return { name, eqType: -1, argCount: -1, category: 'unknown' }
    return { name, eqType, argCount: -1, category: classifyEqType(eqType) }
  }
  // 3-column: name\teqType\targCount
  const eqType = parseInt(rest.slice(0, tab2), 10)
  const argCount = parseInt(rest.slice(tab2 + 1), 10)
  if (Number.isNaN(eqType)) return { name, eqType: -1, argCount: -1, category: 'unknown' }
  return {
    name,
    eqType,
    argCount: Number.isNaN(argCount) ? -1 : argCount,
    category: classifyEqType(eqType),
  }
}

/** Append each item to its keyed bucket in an inverted index. */
function pushAll<T>(index: Map<string, T[]>, items: T[], key: (item: T) => string): void {
  for (const item of items) {
    const k = key(item)
    const bucket = index.get(k)
    if (bucket) bucket.push(item)
    else index.set(k, [item])
  }
}

/** Remove a file's contributions from an inverted index (by location.file). */
function removeAll<T extends { location: SourceLocation }>(
  index: Map<string, T[]>,
  items: T[],
  key: (item: T) => string,
  filePath: string,
): void {
  for (const k of new Set(items.map(key))) {
    const bucket = index.get(k)
    if (!bucket) continue
    const kept = bucket.filter((e) => e.location.file !== filePath)
    if (kept.length) index.set(k, kept)
    else index.delete(k)
  }
}

function detectEnvironments(names: Set<string>): Set<string> {
  const envs = new Set<string>()
  for (const name of names) {
    if (name.length > 3 && name.startsWith('end')) {
      const base = name.slice(3)
      if (!ENV_BLOCKLIST.has(base) && names.has(base)) {
        envs.add(base)
      }
    }
  }
  return envs
}

export class ProjectIndex {
  private files = new Map<string, FileSymbols>()
  private auxData: AuxData = { labels: new Map(), citations: new Set(), includes: [] }
  private bibEntries: BibEntry[] = []
  private bibStrings: BibStringDef[] = []
  private bibFiles = new Map<string, ParsedBibFile>()
  private legacyBibEntries: BibEntry[] = []
  private engineCommands = new Map<string, EngineCommandInfo>()
  private engineEnvironments = new Set<string>()
  private semanticTrace: SemanticTrace | null = null
  private activeFilesCache = new Map<string, string[]>()
  private activeBibFilesCache = new Map<string, string[]>()

  // Inverted indexes (symbol name → definitions/uses) for O(result) lookups,
  // maintained incrementally so a query never rescans the whole project.
  private labelDefIndex = new Map<string, LabelDef[]>()
  private labelRefIndex = new Map<string, LabelRef[]>()
  private citationIndex = new Map<string, CitationRef[]>()
  private bibItemIndex = new Map<string, BibitemDef[]>()
  private commandIndex = new Map<string, CommandDef[]>()
  private commandRefIndex = new Map<string, CommandUse[]>()
  private envDefIndex = new Map<string, EnvironmentUse[]>()
  // .bib entries keyed by cite key for O(1) lookup (a shared .bib can hold thousands).
  private bibEntryIndex = new Map<string, BibEntry[]>()
  // Flattened label list, rebuilt lazily — getAllLabels() is called ~4× per diagnostic run.
  private allLabelsCache: LabelDef[] | null = null

  updateFile(filePath: string, content: string): void {
    const previous = this.files.get(filePath)
    if (previous) this.removeFromIndexes(filePath, previous)
    const symbols = parseLatexFile(content, filePath)
    this.files.set(filePath, symbols)
    this.addToIndexes(symbols)
    this.allLabelsCache = null
    this.activeFilesCache.clear()
    this.activeBibFilesCache.clear()
  }

  removeFile(filePath: string): void {
    const previous = this.files.get(filePath)
    if (previous) this.removeFromIndexes(filePath, previous)
    this.files.delete(filePath)
    this.allLabelsCache = null
    this.activeFilesCache.clear()
    this.activeBibFilesCache.clear()
  }

  private addToIndexes(symbols: FileSymbols): void {
    pushAll(this.labelDefIndex, symbols.labels, (l) => l.name)
    pushAll(this.labelRefIndex, symbols.labelRefs, (r) => r.name)
    pushAll(this.citationIndex, symbols.citations, (c) => c.key)
    pushAll(this.bibItemIndex, symbols.bibItems, (b) => b.key)
    pushAll(this.commandIndex, symbols.commands, (c) => c.name)
    pushAll(this.commandRefIndex, symbols.commandUses, (c) => c.name)
    pushAll(this.envDefIndex, symbols.environmentDefs, (e) => e.name)
  }

  private removeFromIndexes(filePath: string, symbols: FileSymbols): void {
    removeAll(this.labelDefIndex, symbols.labels, (l) => l.name, filePath)
    removeAll(this.labelRefIndex, symbols.labelRefs, (r) => r.name, filePath)
    removeAll(this.citationIndex, symbols.citations, (c) => c.key, filePath)
    removeAll(this.bibItemIndex, symbols.bibItems, (b) => b.key, filePath)
    removeAll(this.commandIndex, symbols.commands, (c) => c.name, filePath)
    removeAll(this.commandRefIndex, symbols.commandUses, (c) => c.name, filePath)
    removeAll(this.envDefIndex, symbols.environmentDefs, (e) => e.name, filePath)
  }

  updateAux(content: string): void {
    this.auxData = parseAuxFile(content)
  }

  updateBib(entries: BibEntry[]): void {
    this.bibFiles.clear()
    this.legacyBibEntries = entries
    this.rebuildBibIndexes()
  }

  updateBibFile(filePath: string, data: ParsedBibFile): void {
    this.legacyBibEntries = []
    this.bibFiles.set(filePath, data)
    this.rebuildBibIndexes()
  }

  removeBibFile(filePath: string): void {
    if (!this.bibFiles.delete(filePath)) return
    this.rebuildBibIndexes()
  }

  replaceBibFiles(files: ReadonlyMap<string, ParsedBibFile>): void {
    this.legacyBibEntries = []
    this.bibFiles = new Map(files)
    this.rebuildBibIndexes()
  }

  private rebuildBibIndexes(): void {
    this.bibEntries = [
      ...this.legacyBibEntries,
      ...[...this.bibFiles.values()].flatMap((file) => file.entries),
    ]
    this.bibStrings = [...this.bibFiles.values()].flatMap((file) => file.strings)
    this.bibEntryIndex = new Map()
    pushAll(this.bibEntryIndex, this.bibEntries, (e) => e.key)
    this.activeBibFilesCache.clear()
  }

  updateAuxData(data: AuxData): void {
    this.auxData = data
  }

  // --- Queries ---

  getFiles(): string[] {
    return [...this.files.keys()]
  }

  hasFile(filePath: string): boolean {
    return this.files.has(filePath)
  }

  getAllLabels(filePath?: string): LabelDef[] {
    if (filePath) return this.symbolsInScope(filePath).flatMap((symbols) => symbols.labels)
    if (!this.allLabelsCache) {
      this.allLabelsCache = [...this.files.values()].flatMap((s) => s.labels)
    }
    return this.allLabelsCache
  }

  getAllLabelRefs(name: string): LabelRef[] {
    return [...(this.labelRefIndex.get(name) ?? [])]
  }

  getFileSymbols(filePath: string): FileSymbols | undefined {
    return this.files.get(filePath)
  }

  /** Files in the deterministic include component that compiles the requested document. */
  getActiveFiles(filePath: string): string[] {
    if (!this.files.has(filePath)) return []
    const cached = this.activeFilesCache.get(filePath)
    if (cached) return [...cached]
    const { edges, reverse } = this.includeGraph()
    const ancestors = new Set([filePath])
    const pending = [filePath]
    while (pending.length > 0) {
      for (const parent of reverse.get(pending.pop()!) ?? []) {
        if (ancestors.has(parent)) continue
        ancestors.add(parent)
        pending.push(parent)
      }
    }
    const roots = [...ancestors]
      .filter((path) => ![...(reverse.get(path) ?? [])].some((parent) => ancestors.has(parent)))
      .sort()
    const ordered: string[] = []
    const seen = new Set<string>()
    const visit = (path: string) => {
      if (seen.has(path)) return
      seen.add(path)
      ordered.push(path)
      for (const target of edges.get(path) ?? []) visit(target)
    }
    for (const root of roots.length > 0 ? roots : [filePath]) visit(root)
    this.activeFilesCache.set(filePath, ordered)
    return [...ordered]
  }

  private includeGraph(): {
    edges: Map<string, string[]>
    reverse: Map<string, Set<string>>
  } {
    const edges = new Map<string, string[]>()
    const reverse = new Map<string, Set<string>>()
    for (const [source, symbols] of this.files) {
      const targets = [
        ...symbols.includes.map((include) => ({
          target: this.resolveInclude(source, include.path),
          location: include.location,
        })),
        ...symbols.packages.map((pkg) => ({
          target: this.resolveLoadedResource(source, pkg.name, 'sty'),
          location: pkg.location,
        })),
        ...symbols.classes.map((cls) => ({
          target: this.resolveLoadedResource(source, cls.name, 'cls'),
          location: cls.location,
        })),
      ]
        .sort((a, b) => a.location.line - b.location.line || a.location.column - b.location.column)
        .map((entry) => entry.target)
        .filter((target): target is string => target !== null)
      edges.set(source, targets)
      for (const target of targets) {
        const parents = reverse.get(target) ?? new Set<string>()
        parents.add(source)
        reverse.set(target, parents)
      }
    }
    return { edges, reverse }
  }

  getActiveColors(filePath: string): ColorDefinition[] {
    const active = new Set(this.getActiveFiles(filePath))
    if (active.size === 0) return []
    const { reverse } = this.includeGraph()
    const roots = [...active]
      .filter((path) => ![...(reverse.get(path) ?? [])].some((parent) => active.has(parent)))
      .sort()
    const colors: ColorDefinition[] = []
    const visit = (path: string, stack: Set<string>) => {
      if (stack.has(path)) return
      const symbols = this.files.get(path)
      if (!symbols) return
      const nested = new Set(stack).add(path)
      const events = [
        ...symbols.colors.map((color, order) => ({
          type: 'color' as const,
          line: color.location.line,
          column: color.location.column,
          order,
          color,
        })),
        ...symbols.includes.map((include, order) => ({
          type: 'include' as const,
          line: include.location.line,
          column: include.location.column,
          order,
          target: this.resolveInclude(path, include.path),
        })),
        ...symbols.packages.map((pkg, order) => ({
          type: 'load' as const,
          line: pkg.location.line,
          column: pkg.location.column,
          order,
          target: this.resolveLoadedResource(path, pkg.name, 'sty'),
        })),
        ...symbols.classes.map((cls, order) => ({
          type: 'load' as const,
          line: cls.location.line,
          column: cls.location.column,
          order,
          target: this.resolveLoadedResource(path, cls.name, 'cls'),
        })),
      ].sort(
        (a, b) =>
          a.line - b.line ||
          a.column - b.column ||
          a.type.localeCompare(b.type) ||
          a.order - b.order,
      )
      for (const event of events) {
        if (event.type === 'color') colors.push(event.color)
        else if (event.target && active.has(event.target)) visit(event.target, nested)
      }
    }
    for (const root of roots.length > 0 ? roots : [filePath]) visit(root, new Set())
    return colors
  }

  getActiveColorNames(filePath: string): Set<string> {
    return new Set(
      this.getActiveFiles(filePath).flatMap(
        (path) => this.files.get(path)?.colorActivations.flatMap((entry) => entry.names) ?? [],
      ),
    )
  }

  getLoadedClasses(filePath?: string): Set<string> {
    const names = new Set<string>()
    for (const symbols of this.symbolsInScope(filePath)) {
      for (const cls of symbols.classes) names.add(cls.name)
    }
    return names
  }

  getClassOptions(filePath?: string): Set<string> {
    const options = new Set<string>()
    for (const symbols of this.symbolsInScope(filePath)) {
      for (const cls of symbols.classes) {
        for (const option of cls.options.split(',')) if (option.trim()) options.add(option.trim())
      }
    }
    return options
  }

  getPackageOptions(name: string, filePath?: string): Set<string> {
    const options = new Set<string>()
    for (const symbols of this.symbolsInScope(filePath)) {
      for (const pkg of symbols.packages) {
        if (pkg.name !== name) continue
        for (const option of pkg.options.split(',')) if (option.trim()) options.add(option.trim())
      }
    }
    return options
  }

  getCommandDefs(filePath?: string): CommandDef[] {
    return this.itemsInScope(filePath, (symbols) => symbols.commands)
  }

  getAllEnvironments(filePath?: string): string[] {
    const names = new Set<string>()
    for (const symbols of this.symbolsInScope(filePath)) {
      for (const env of symbols.environmentDefs) names.add(env.name)
      for (const env of symbols.environments) {
        names.add(env.name)
      }
    }
    return [...names]
  }

  getEnvironmentDefinitions(filePath?: string): EnvironmentUse[] {
    return this.itemsInScope(filePath, (symbols) => symbols.environmentDefs)
  }

  /** Names of all packages loaded via `\usepackage`/`\RequirePackage` in the project. */
  getLoadedPackages(filePath?: string): Set<string> {
    const names = new Set<string>()
    for (const symbols of this.symbolsInScope(filePath)) {
      for (const pkg of symbols.packages) names.add(pkg.name)
    }
    return names
  }

  private symbolsInScope(filePath?: string): FileSymbols[] {
    return filePath && this.files.has(filePath)
      ? this.getActiveFiles(filePath).flatMap((path) => {
          const symbols = this.files.get(path)
          return symbols ? [symbols] : []
        })
      : [...this.files.values()]
  }

  private resolveInclude(source: string, target: string): string | null {
    const path = this.resolveProjectPath(source, target)
    if (!path) return null
    for (const candidate of /\.[A-Za-z0-9]+$/.test(path) ? [path] : [path, `${path}.tex`]) {
      if (this.files.has(candidate)) return candidate
    }
    return null
  }

  private resolveLoadedResource(
    source: string,
    target: string,
    extension: 'cls' | 'sty',
  ): string | null {
    const relative = this.resolveProjectPath(source, target)
    const root = this.resolveProjectPath('', target)
    for (const base of [relative, root]) {
      if (!base) continue
      const candidate = base.endsWith(`.${extension}`) ? base : `${base}.${extension}`
      if (this.files.has(candidate)) return candidate
    }
    return null
  }

  private resolveProjectPath(source: string, target: string): string | null {
    const trimmed = target.trim().replaceAll('\\\\', '/')
    if (!trimmed || /[\\#{}]/.test(trimmed)) return null
    const sourceParts = source.split('/').slice(0, -1)
    const targetParts = trimmed.startsWith('/')
      ? trimmed.slice(1).split('/')
      : [...sourceParts, ...trimmed.split('/')]
    const normalized: string[] = []
    for (const part of targetParts) {
      if (!part || part === '.') continue
      if (part === '..') normalized.pop()
      else normalized.push(part)
    }
    return normalized.join('/')
  }

  private bibliographyPathsFromTex(filePath: string): string[] {
    const paths = new Set<string>()
    for (const symbols of this.symbolsInScope(filePath)) {
      for (const ref of symbols.bibliographies) {
        for (const path of this.resolveBibliographyRef(ref.location.file, ref.path)) paths.add(path)
      }
    }
    return [...paths]
  }

  private resolveBibliographyRef(source: string, target: string): string[] {
    const path = this.resolveProjectPath(source, target)
    if (!path) return []
    const candidates = /\.[A-Za-z0-9]+$/.test(path) ? [path] : [path, `${path}.bib`]
    return candidates.filter((candidate) => this.bibFiles.has(candidate))
  }

  getActiveBibFiles(filePath?: string): string[] {
    if (!filePath || this.bibFiles.size === 0) return [...this.bibFiles.keys()]
    const cached = this.activeBibFilesCache.get(filePath)
    if (cached) return [...cached]
    if (/\.(?:tex|sty|cls|ltx)$/i.test(filePath)) {
      const selected = this.bibliographyPathsFromTex(filePath)
      const result = selected.length > 0 ? selected : [...this.bibFiles.keys()]
      this.activeBibFilesCache.set(filePath, result)
      return [...result]
    }
    if (!filePath.toLowerCase().endsWith('.bib')) return [...this.bibFiles.keys()]
    const selected = new Set<string>()
    const sources = [...this.files].filter(([source, symbols]) =>
      symbols.bibliographies.some((ref) =>
        this.resolveBibliographyRef(source, ref.path).includes(filePath),
      ),
    )
    for (const [source] of sources) {
      const paths = this.bibliographyPathsFromTex(source)
      for (const path of paths) selected.add(path)
    }
    const result = selected.size > 0 ? [...selected] : [...this.bibFiles.keys()]
    this.activeBibFilesCache.set(filePath, result)
    return [...result]
  }

  getBibEntries(filePath?: string): BibEntry[] {
    if (!filePath || this.bibFiles.size === 0) return [...this.bibEntries]
    return this.getActiveBibFiles(filePath).flatMap(
      (path) => this.bibFiles.get(path)?.entries ?? [],
    )
  }

  getBibStrings(filePath?: string): BibStringDef[] {
    if (!filePath) return [...this.bibStrings]
    return this.getActiveBibFiles(filePath).flatMap(
      (path) => this.bibFiles.get(path)?.strings ?? [],
    )
  }

  getProjectValues(
    kind: 'counter' | 'length' | 'glossary' | 'acronym' | 'font-family',
    filePath?: string,
  ): ProjectValue[] {
    return this.itemsInScope(filePath, (symbols) => {
      if (kind === 'counter') return symbols.counters
      if (kind === 'length') return symbols.lengths
      if (kind === 'glossary') return symbols.glossaryEntries
      if (kind === 'acronym') return symbols.acronymEntries
      return symbols.fontFamilies
    })
  }

  getProjectKeys(filePath?: string, families?: ReadonlySet<string>): ProjectKeyDefinition[] {
    return this.itemsInScope(filePath, (symbols) => symbols.keys).filter(
      (key) => !families || families.has(key.family),
    )
  }

  private itemsInScope<T extends { location: SourceLocation }>(
    filePath: string | undefined,
    select: (symbols: FileSymbols) => T[],
  ): T[] {
    if (!filePath || !this.files.has(filePath)) {
      return [...this.files.values()].flatMap(select)
    }
    const active = new Set(this.getActiveFiles(filePath))
    const { reverse } = this.includeGraph()
    const roots = [...active]
      .filter((path) => ![...(reverse.get(path) ?? [])].some((parent) => active.has(parent)))
      .sort()
    const result: T[] = []
    const visit = (path: string, stack: Set<string>) => {
      if (stack.has(path)) return
      const symbols = this.files.get(path)
      if (!symbols) return
      const nested = new Set(stack).add(path)
      const items = select(symbols)
      const events = [
        ...items.map((item, order) => ({
          type: 'item' as const,
          location: item.location,
          order,
          item,
        })),
        ...this.loadEvents(path, symbols),
      ].sort(
        (a, b) =>
          a.location.line - b.location.line ||
          a.location.column - b.location.column ||
          a.type.localeCompare(b.type) ||
          a.order - b.order,
      )
      for (const event of events) {
        if (event.type === 'item') result.push(event.item)
        else if (event.target && active.has(event.target)) visit(event.target, nested)
      }
    }
    for (const root of roots.length > 0 ? roots : [filePath]) visit(root, new Set())
    return result
  }

  private loadEvents(path: string, symbols: FileSymbols) {
    return [
      ...symbols.includes.map((include, order) => ({
        type: 'load' as const,
        location: include.location,
        order,
        target: this.resolveInclude(path, include.path),
      })),
      ...symbols.packages.map((pkg, order) => ({
        type: 'load' as const,
        location: pkg.location,
        order,
        target: this.resolveLoadedResource(path, pkg.name, 'sty'),
      })),
      ...symbols.classes.map((cls, order) => ({
        type: 'load' as const,
        location: cls.location,
        order,
        target: this.resolveLoadedResource(path, cls.name, 'cls'),
      })),
    ]
  }

  getStats(): ProjectIndexStats {
    let latexSymbols = 0
    let estimatedCodeUnits = 0
    for (const [path, symbols] of this.files) {
      estimatedCodeUnits += path.length + JSON.stringify(symbols).length
      for (const values of Object.values(symbols)) latexSymbols += values.length
    }
    for (const [path, data] of this.bibFiles) {
      estimatedCodeUnits += path.length + JSON.stringify(data).length
    }
    estimatedCodeUnits += JSON.stringify(this.legacyBibEntries).length
    return {
      sourceFiles: this.files.size,
      bibliographyFiles: this.bibFiles.size,
      latexSymbols,
      bibliographyEntries: this.bibEntries.length,
      bibliographyStrings: this.bibStrings.length,
      estimatedBytes: estimatedCodeUnits * 2,
    }
  }

  getAuxLabels(): Map<string, string> {
    return this.auxData.labels
  }

  getAuxCitations(): Set<string> {
    return this.auxData.citations
  }

  resolveLabel(name: string): string | undefined {
    return this.auxData.labels.get(name)
  }

  /** Find the LabelDef for a given label name */
  findLabelDef(name: string): LabelDef | undefined {
    return this.labelDefIndex.get(name)?.[0]
  }

  updateEngineCommands(commands: string[]): void {
    this.engineCommands = new Map()
    const names = new Set<string>()
    for (const entry of commands) {
      const info = parseEngineEntry(entry)
      if (L3_INTERNAL_RE.test(info.name)) continue
      this.engineCommands.set(info.name, info)
      names.add(info.name)
    }
    // LaTeX's \DeclareRobustCommand creates a 0-arg wrapper "\foo" that
    // calls an inner "\foo " (trailing space) which has the real args.
    // Merge arg counts from "name " entries into "name" entries.
    for (const [name, info] of this.engineCommands) {
      if (!name.endsWith(' ') || info.argCount <= 0) continue
      const baseName = name.trimEnd()
      const baseInfo = this.engineCommands.get(baseName)
      if (baseInfo && baseInfo.argCount <= 0) {
        baseInfo.argCount = info.argCount
      }
    }
    this.engineEnvironments = detectEnvironments(names)
  }

  getEngineCommands(): ReadonlyMap<string, EngineCommandInfo> {
    return this.engineCommands
  }

  getEngineEnvironments(): ReadonlySet<string> {
    return this.engineEnvironments
  }

  updateSemanticTrace(trace: SemanticTrace): void {
    this.semanticTrace = trace
  }

  getSemanticTrace(): SemanticTrace | null {
    return this.semanticTrace
  }

  /** Find the BibitemDef for a given citation key */
  findBibitemDef(key: string): BibitemDef | undefined {
    return this.bibItemIndex.get(key)?.[0]
  }

  /** Find the BibEntry for a given citation key in .bib files */
  findBibEntry(key: string): BibEntry | undefined {
    return this.bibEntryIndex.get(key)?.[0]
  }

  /** Find the CommandDef for a given command name */
  findCommandDef(name: string): CommandDef | undefined {
    return this.commandIndex.get(name)?.[0]
  }

  /** Find the Environment definition for a given environment name */
  findEnvironmentDef(name: string): EnvironmentUse | undefined {
    return this.envDefIndex.get(name)?.[0]
  }

  /** Find the symbol at a given position and its usage locations */
  findSymbolAt(
    filePath: string,
    line: number,
    column: number,
  ): { name: string; type: 'label' | 'citation' | 'command' } | undefined {
    const symbols = this.files.get(filePath)
    if (!symbols) return undefined

    return (
      this.findLabelAt(symbols, line, column) ||
      this.findCitationAt(symbols, line, column) ||
      this.findCommandAt(symbols, line, column)
    )
  }

  private findLabelAt(symbols: FileSymbols, line: number, column: number) {
    for (const label of symbols.labels) {
      if (
        label.location.line === line &&
        column >= label.location.column &&
        column <= label.location.column + label.name.length
      ) {
        return { name: label.name, type: 'label' as const }
      }
    }
    for (const ref of symbols.labelRefs) {
      if (
        ref.location.line === line &&
        column >= ref.location.column &&
        column <= ref.location.column + ref.name.length
      ) {
        return { name: ref.name, type: 'label' as const }
      }
    }
    return undefined
  }

  private findCitationAt(symbols: FileSymbols, line: number, column: number) {
    for (const ref of symbols.citations) {
      if (
        ref.location.line === line &&
        column >= ref.location.column &&
        column <= ref.location.column + ref.key.length
      ) {
        return { name: ref.key, type: 'citation' as const }
      }
    }
    for (const item of symbols.bibItems) {
      if (
        item.location.line === line &&
        column >= item.location.column &&
        column <= item.location.column + item.key.length
      ) {
        return { name: item.key, type: 'citation' as const }
      }
    }
    return undefined
  }

  private findCommandAt(symbols: FileSymbols, line: number, column: number) {
    for (const cmd of symbols.commands) {
      if (
        cmd.location.line === line &&
        column >= cmd.location.column &&
        column <= cmd.location.column + cmd.name.length
      ) {
        return { name: cmd.name, type: 'command' as const }
      }
    }
    // A call site of a user-defined command (one with a definition somewhere in the
    // project) — so rename/references reach the usages, not just the definition.
    for (const use of symbols.commandUses) {
      if (
        use.location.line === line &&
        column >= use.location.column &&
        column <= use.location.column + use.name.length &&
        this.commandIndex.has(use.name)
      ) {
        return { name: use.name, type: 'command' as const }
      }
    }
    return undefined
  }

  /**
   * Find all occurrences of a symbol across the project. O(result) — backed by
   * the inverted indexes, not a full-project scan.
   */
  findAllOccurrences(name: string, type: 'label' | 'citation' | 'command'): Occurrence[] {
    const locations = this.occurrenceLocations(name, type)
    return locations.map((loc) => ({
      filePath: loc.file,
      line: loc.line,
      column: loc.column,
      length: name.length,
    }))
  }

  private occurrenceLocations(
    name: string,
    type: 'label' | 'citation' | 'command',
  ): SourceLocation[] {
    if (type === 'label') {
      return [...locs(this.labelDefIndex.get(name)), ...locs(this.labelRefIndex.get(name))]
    }
    if (type === 'citation') {
      return [
        ...locs(this.citationIndex.get(name)),
        ...locs(this.bibItemIndex.get(name)),
        ...locs(this.bibEntryIndex.get(name)),
      ]
    }
    // Every `\name` token (the definition's own name token is captured as a use too),
    // so a rename rewrites the definition and all call sites together.
    return locs(this.commandRefIndex.get(name))
  }
}

/** Project the `location` of each indexed entry (empty when the bucket is absent). */
function locs<T extends { location: SourceLocation }>(entries: T[] | undefined): SourceLocation[] {
  return (entries ?? []).map((e) => e.location)
}

/** A single occurrence of a symbol (definition or use) in the project. */
export interface Occurrence {
  filePath: string
  line: number
  column: number
  length: number
}
