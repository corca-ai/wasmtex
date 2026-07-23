/**
 * Headless dependency-graph builder (#54 slice 4). Reconstructs what a compile
 * depended on — the file / package / class / font graph — from signals available
 * without an engine patch:
 *   - the **log** (every engine): each `(./file … )` open is a file the compile read,
 *     nested under its parent (reuses {@link scanFileEvents});
 *   - the TeX engine's **`.fls` recorder** (`inputFiles`): the authoritative read list;
 *   - **XDV font defs** (XeLaTeX): the fonts actually used;
 *   - the **source** (`\documentclass`/`\usepackage`/`\input`): declared dependencies,
 *     which also catch intent the log formats oddly.
 *
 * The graph is the substrate for exact cache invalidation and incremental compile
 * (#55). Headless: data only — the host decides what to do with it.
 */

import type { DependencyEdge, DependencyGraph, DependencyNode } from '../types'
import { scanFileEvents } from './parse-errors'

type Source = DependencyNode['discoveredBy'][number]
type Kind = DependencyNode['kind']
type Relation = DependencyEdge['relation']

const KIND_BY_EXT: Record<string, Kind> = {
  tex: 'tex',
  ltx: 'tex',
  cls: 'class',
  sty: 'package',
  otf: 'font',
  ttf: 'font',
  pfb: 'font',
  bib: 'bib',
  bbl: 'bib',
  bst: 'bib',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  eps: 'image',
  pdf: 'image', // \includegraphics{figure.pdf} — common in pdfLaTeX
}

function kindOf(id: string): Kind {
  const ext = id.slice(id.lastIndexOf('.') + 1).toLowerCase()
  return KIND_BY_EXT[ext] ?? 'other'
}

/** A `.sty`/`.cls`/`.tex` child is `loads`/`includes`; everything else `reads`. */
function relationForChild(id: string): Relation {
  const kind = kindOf(id)
  if (kind === 'tex') return 'includes'
  if (kind === 'package' || kind === 'class') return 'loads'
  return 'reads'
}

/** A file the engine opened by an absolute path (not `./` or `/work/`) comes from the
 *  bundled mirror, not the user's project. */
function originOf(raw: string): DependencyNode['origin'] {
  if (raw.startsWith('./') || raw.startsWith('/work/')) return 'project'
  return raw.startsWith('/') ? 'system' : 'project'
}

/** Stable graph id + origin for a raw engine path. Project files keep their relative
 *  path (so `chapters/intro.tex` ≠ `appendix/intro.tex`); system/mirror files are keyed
 *  by basename (`amsmath.sty`) — how `\usepackage` refers to them, so log and source
 *  signals merge into one node. */
function idFor(raw: string): { id: string; origin: DependencyNode['origin'] } {
  const origin = originOf(raw)
  let p = raw
  // Strip the project working-dir prefix, then collapse internal `/./` segments
  // and any leading `./` *in place* — without dropping leading directories, so
  // `chapters/intro.tex` and `appendix/intro.tex` stay distinct nodes.
  if (p.startsWith('/work/')) p = p.slice(6)
  p = p.replace(/\/\.\//g, '/').replace(/^\.\//, '')
  return { id: origin === 'system' ? p.replace(/^.*\//, '') : p, origin }
}

/** Accumulates nodes/edges, merging `discoveredBy` so a dep seen via several signals
 *  stays one entry. */
class GraphBuilder {
  private readonly nodes = new Map<string, DependencyNode>()
  private readonly edges = new Map<string, DependencyEdge>()
  root: string | undefined

  addNode(id: string, kind: Kind, origin: DependencyNode['origin'], by: Source): void {
    const existing = this.nodes.get(id)
    if (existing) {
      if (!existing.discoveredBy.includes(by)) existing.discoveredBy.push(by)
      return
    }
    this.nodes.set(id, { id, kind, origin, discoveredBy: [by] })
  }

  addEdge(from: string, to: string, relation: Relation, by: Source): void {
    if (from === to) return
    const key = `${from}\t${to}\t${relation}`
    const existing = this.edges.get(key)
    if (existing) {
      if (!existing.discoveredBy.includes(by)) existing.discoveredBy.push(by)
      return
    }
    this.edges.set(key, { from, to, relation, discoveredBy: [by] })
  }

  build(): DependencyGraph {
    // Materialize the root as a node if only root-anchored edges (source/fls/font
    // signals) referenced it — e.g. when the log never recorded the root open —
    // so no edge dangles past the node set.
    if (this.root && !this.nodes.has(this.root)) {
      this.addNode(this.root, kindOf(this.root), originOf(this.root), 'source')
    }
    const graph: DependencyGraph = {
      nodes: [...this.nodes.values()],
      edges: [...this.edges.values()],
    }
    if (this.root) graph.root = this.root
    return graph
  }
}

/** Internal engine scratch files (e.g. `__strace.tex` from our semantic-trace hook) —
 *  instrumentation, not a user dependency. */
function isInternal(id: string): boolean {
  return id.replace(/^.*\//, '').startsWith('__')
}

/** Walk the log's file opens into parent→child edges. Internal artifacts are still
 *  pushed onto the stack (to keep the nesting balanced) but never become nodes/edges. */
function addLogDeps(g: GraphBuilder, log: string): void {
  const stack: string[] = []
  for (const ev of scanFileEvents(log.split('\n'))) {
    if (ev.type === 'open') {
      const { id, origin } = idFor(ev.raw)
      const parent = stack[stack.length - 1]
      if (!isInternal(id)) {
        g.addNode(id, kindOf(id), origin, 'log')
        g.root ??= id
        if (parent && !isInternal(parent)) g.addEdge(parent, id, relationForChild(id), 'log')
      }
      stack.push(id)
    } else if (ev.type === 'close') {
      stack.pop()
    }
  }
}

/** The TeX engine's `.fls` recorder list: authoritative reads, but without parent info — so
 *  attach each to the root with a `reads` edge. */
function addFlsDeps(g: GraphBuilder, inputFiles: string[]): void {
  for (const raw of inputFiles) {
    if (!raw || raw.endsWith('/')) continue
    const { id, origin } = idFor(raw)
    if (!id) continue
    g.addNode(id, kindOf(id), origin, 'fls')
    if (g.root) g.addEdge(g.root, id, 'reads', 'fls')
  }
}

/** Fonts the XeTeX XDV actually used (basenames). */
function addFontDeps(g: GraphBuilder, fonts: string[]): void {
  for (const font of fonts) {
    g.addNode(font, 'font', 'system', 'xdv')
    if (g.root) g.addEdge(g.root, font, 'uses-font', 'xdv')
  }
}

const CLASS_RE = /\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}/
const USEPACKAGE_RE = /\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{([^}]+)\}/g
const INPUT_RE = /\\(?:input|include|subfile)\{([^}]+)\}/g

/** Add a source-declared dependency, normalizing its id to match the log's file id
 *  (e.g. `amsmath` → `amsmath.sty`) so the two signals merge. */
function addDeclared(g: GraphBuilder, name: string, ext: string, relation: Relation): void {
  const trimmed = name.trim()
  if (!trimmed) return
  const id = trimmed.includes('.') ? trimmed : `${trimmed}.${ext}`
  const origin = relation === 'includes' ? 'project' : 'system'
  g.addNode(id, kindOf(id), origin, 'source')
  if (g.root) g.addEdge(g.root, id, relation, 'source')
}

/** Declared dependencies from the main source: `\documentclass`, `\usepackage`/
 *  `\RequirePackage` (comma lists), and `\input`/`\include`/`\subfile`. */
function addSourceDeps(g: GraphBuilder, source: string): void {
  g.root ??= 'main.tex'
  const cls = source.match(CLASS_RE)
  if (cls) addDeclared(g, cls[1]!, 'cls', 'loads')
  for (const m of source.matchAll(USEPACKAGE_RE)) {
    for (const pkg of m[1]!.split(',')) addDeclared(g, pkg, 'sty', 'loads')
  }
  for (const m of source.matchAll(INPUT_RE)) addDeclared(g, m[1]!, 'tex', 'includes')
}

export interface DependencyOpts {
  /** TeX engine `.fls` input list (`CompileResult.inputFiles`). */
  inputFiles?: string[] | undefined
  /** Font basenames used by the document (from the XeTeX XDV). */
  fonts?: string[] | undefined
  /** Main source content, for `\usepackage`/`\input` declared dependencies. */
  source?: string | undefined
}

/** Build the compile dependency graph from the log, enriched with any of the optional
 *  per-engine signals (#54 slice 4). */
export function buildDependencyGraph(log: string, opts: DependencyOpts = {}): DependencyGraph {
  const g = new GraphBuilder()
  addLogDeps(g, log)
  if (opts.source) addSourceDeps(g, opts.source)
  if (opts.inputFiles?.length) addFlsDeps(g, opts.inputFiles)
  if (opts.fonts?.length) addFontDeps(g, opts.fonts)
  return g.build()
}
