import type {
  CompileResult,
  DependencyManifest,
  DependencyManifestCoverage,
  DependencyManifestIncompleteReason,
} from '../types'
import type { TexEngine } from './engine-select'

export interface AuxiliaryDependencyObservation {
  stage: 'bibliography' | 'index'
  projectInputs: string[]
  complete: boolean
}

interface BuildDependencyManifestOptions {
  engine: TexEngine
  root: string
  projectFiles: string[]
  generatedFiles?: Iterable<string>
  auxiliaryStages?: AuxiliaryDependencyObservation[]
  result: CompileResult
}

const ENGINE_INTERNAL_PATHS = new Set([
  '__strace.tex',
  '_checkpoint.tex',
  '_preamble.tex',
  'tail.tex',
  'texmf.cnf',
])

function collapseProjectSegments(path: string): string | null {
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (parts.length === 0) return null
      parts.pop()
    } else {
      parts.push(part)
    }
  }
  return parts.length > 0 ? parts.join('/') : null
}

/**
 * Normalize a path into the virtual project's root-relative namespace.
 *
 * Absolute paths outside `/work` are engine/system inputs and return `null`.
 * Paths that escape the project root are rejected rather than guessed.
 */
export function normalizeProjectDependencyPath(raw: string): string | null {
  if (!raw || raw.includes('\0')) return null
  let path = raw.replaceAll('\\', '/')
  if (/^[A-Za-z]:\//.test(path)) return null
  if (path === '/work') return null
  if (path.startsWith('/work/')) path = path.slice('/work/'.length)
  else if (path.startsWith('/')) return null

  return collapseProjectSegments(path)
}

function normalizedSet(paths: Iterable<string>): Set<string> {
  const result = new Set<string>()
  for (const path of paths) {
    const normalized = normalizeProjectDependencyPath(path)
    if (normalized) result.add(normalized)
  }
  return result
}

function projectCandidates(
  projectFiles: string[],
  generatedFiles: Iterable<string> | undefined,
): Set<string> {
  const candidates = normalizedSet(projectFiles)
  for (const generated of generatedFiles ?? []) {
    const normalized = normalizeProjectDependencyPath(generated)
    if (normalized) candidates.delete(normalized)
  }
  for (const internal of ENGINE_INTERNAL_PATHS) candidates.delete(internal)
  return candidates
}

function observedProjectInputs(
  paths: Iterable<string>,
  candidates: ReadonlySet<string>,
): Set<string> {
  const inputs = new Set<string>()
  for (const path of paths) {
    const normalized = normalizeProjectDependencyPath(path)
    if (normalized && candidates.has(normalized)) inputs.add(normalized)
  }
  return inputs
}

function graphProjectInputs(result: CompileResult, candidates: ReadonlySet<string>): Set<string> {
  return observedProjectInputs(
    (result.telemetry?.dependencies?.nodes ?? [])
      .filter((node) => node.origin === 'project')
      .map((node) => node.id),
    candidates,
  )
}

function isReusableRenderedResult(result: CompileResult): boolean {
  if (!result.success || !result.pdf) return false
  if (result.errors.some((error) => error.severity === 'error')) return false
  return !result.telemetry?.diagnostics.some((diagnostic) => diagnostic.severity === 'error')
}

function reasonFor(
  result: CompileResult,
  engineReason: DependencyManifestIncompleteReason | undefined,
  auxiliaryStages: AuxiliaryDependencyObservation[],
): DependencyManifestIncompleteReason | undefined {
  if (!isReusableRenderedResult(result)) return 'compile-failed'
  if (engineReason) return engineReason
  if (auxiliaryStages.some((stage) => !stage.complete)) return 'auxiliary-stage-failed'
  return undefined
}

interface EngineDependencyObservation {
  projectInputs: Set<string>
  coverage: DependencyManifestCoverage[]
  incompleteReason?: DependencyManifestIncompleteReason
}

function observeEngineDependencies(
  engine: TexEngine,
  result: CompileResult,
  candidates: ReadonlySet<string>,
  root: string,
): EngineDependencyObservation {
  const recorderInputs = observedProjectInputs(result.inputFiles ?? [], candidates)
  const recorderComplete =
    result.inputFilesComplete === true &&
    isReusableRenderedResult(result) &&
    recorderInputs.has(root)
  if (engine !== 'xelatex') {
    return {
      projectInputs: recorderInputs,
      coverage: [{ stage: 'latex', source: 'recorder', complete: recorderComplete }],
      ...(recorderComplete ? {} : { incompleteReason: 'recorder-unavailable' }),
    }
  }

  return {
    projectInputs: new Set([...recorderInputs, ...graphProjectInputs(result, candidates)]),
    coverage: [
      { stage: 'latex', source: 'recorder', complete: recorderComplete },
      { stage: 'pdf-conversion', source: 'log', complete: false },
      { stage: 'pdf-conversion', source: 'xdv', complete: false },
    ],
    incompleteReason: recorderComplete
      ? 'pdf-conversion-recorder-unavailable'
      : 'engine-recorder-unavailable',
  }
}

/** Build the sound manifest at the orchestration boundary where project files and
 * auxiliary-stage requests are both visible. */
export function buildDependencyManifest(
  options: BuildDependencyManifestOptions,
): DependencyManifest {
  const auxiliaryStages = options.auxiliaryStages ?? []
  const candidates = projectCandidates(options.projectFiles, options.generatedFiles)
  const root = normalizeProjectDependencyPath(options.root) ?? options.root
  const engine = observeEngineDependencies(options.engine, options.result, candidates, root)

  for (const stage of auxiliaryStages) {
    for (const path of observedProjectInputs(stage.projectInputs, candidates)) {
      engine.projectInputs.add(path)
    }
    engine.coverage.push({
      stage: stage.stage,
      source: 'backend-request',
      complete: stage.complete,
    })
  }

  const incompleteReason = reasonFor(options.result, engine.incompleteReason, auxiliaryStages)
  return {
    version: 1,
    root,
    projectInputs: [...engine.projectInputs].sort(),
    complete: incompleteReason === undefined,
    coverage: engine.coverage,
    ...(incompleteReason ? { incompleteReason } : {}),
  }
}

/** Incremental tail compilation does not currently return recorder observations.
 * Carry the last known inputs for tooling, but explicitly revoke completeness so
 * a newly introduced tail input can never be hidden from a host invalidator. */
export function buildIncrementalDependencyManifest(
  root: string,
  previous?: DependencyManifest,
): DependencyManifest {
  const normalizedRoot = normalizeProjectDependencyPath(root) ?? root
  const projectInputs = new Set(previous?.projectInputs ?? [])
  projectInputs.add(normalizedRoot)
  return {
    version: 1,
    root: normalizedRoot,
    projectInputs: [...projectInputs].sort(),
    complete: false,
    coverage: [{ stage: 'latex', source: 'recorder', complete: false }],
    incompleteReason: 'incremental-dependencies-unavailable',
  }
}
