/**
 * Exact TeX Live dependency set of a compile (#80).
 *
 * The cold first compile is dominated by the worker's serial synchronous mirror
 * fetches (one request per kpathsea lookup, each paying full network latency).
 * The resolver evidence already records every lookup with its outcome and the
 * mirror object that answered it. Unioned across the reruns of one compile, that
 * is a complete prefetch manifest: a host stores the names, and next session
 * `warmup({ dependencies })` fetches them in parallel before the engine boots.
 */
import type {
  CompletionSnapshotProfile,
  ResolverEvidence,
  ResolverEvidenceReport,
  TexliveDependency,
  TexliveDependencySet,
  TexliveFileEntry,
  TexliveVersion,
} from '../types'

/** Format files are engine-shipped (base) or project-specific (preamble snapshot),
 *  never a mirror prefetch target. */
const FORMAT_FILE = 10

/** pdfTeX reads the font map at shipout; the engine preloads it at init outside
 *  kpathsea, so it never appears in resolver evidence but is always fetched. */
const PDFTEX_MAP: TexliveDependency = { format: 11, filename: 'pdftex.map' }

export interface TexliveDependencyOptions {
  /** Request names to leave out of `notFound` — project inputs and generated
   *  auxiliary files that kpathsea probes on the mirror before finding them in
   *  the work directory. They are absent on every mirror and would only bloat
   *  a persisted set. */
  excludeNames?: ReadonlySet<string>
}

interface DependencyAccumulator {
  files: Map<string, TexliveDependency>
  notFound: Map<string, TexliveFileEntry>
  complete: boolean
}

/** The mirror object name that answered a request, when it differs from the request. */
function mirrorCandidate(entry: ResolverEvidence): string | undefined {
  const hit = entry.attempts.find(
    (attempt) => attempt.source === 'network' && attempt.outcome === 'hit',
  )
  return hit?.candidate && hit.candidate !== entry.requestedName ? hit.candidate : undefined
}

function recordResolved(acc: DependencyAccumulator, key: string, entry: ResolverEvidence): void {
  const candidate = mirrorCandidate(entry)
  const known = acc.files.get(key)
  // A later pass usually reports a cache hit without the mirror name; keep the
  // pass that saw the network so `candidate` survives.
  if (!known || (candidate && !known.candidate)) {
    acc.files.set(key, {
      format: entry.format,
      filename: entry.requestedName,
      ...(candidate ? { candidate } : {}),
    })
  }
  acc.notFound.delete(key)
}

function recordEntry(acc: DependencyAccumulator, entry: ResolverEvidence): void {
  if (entry.format === FORMAT_FILE) return
  const key = `${entry.format}/${entry.requestedName}`
  if (entry.outcome === 'resolved') {
    recordResolved(acc, key, entry)
  } else if (entry.outcome === 'mirror-absent' && !acc.files.has(key)) {
    acc.notFound.set(key, { format: entry.format, filename: entry.requestedName })
  }
  // transport-error: no evidence either way — leave it for the worker to retry.
}

export function buildTexliveDependencySet(
  texliveVersion: TexliveVersion,
  profile: CompletionSnapshotProfile,
  reports: ReadonlyArray<ResolverEvidenceReport | undefined>,
  options: TexliveDependencyOptions = {},
): TexliveDependencySet | undefined {
  const present = reports.filter((report): report is ResolverEvidenceReport => !!report)
  if (present.length === 0) return undefined

  const acc: DependencyAccumulator = { files: new Map(), notFound: new Map(), complete: true }
  let pdftex = false
  for (const report of present) {
    if (!report.complete) acc.complete = false
    for (const entry of report.entries) {
      if (entry.stage === 'pdftex') pdftex = true
      if (options.excludeNames?.has(entry.requestedName) && entry.outcome !== 'resolved') continue
      recordEntry(acc, entry)
    }
  }
  const mapKey = `${PDFTEX_MAP.format}/${PDFTEX_MAP.filename}`
  if (pdftex && !acc.files.has(mapKey)) acc.files.set(mapKey, { ...PDFTEX_MAP })

  return {
    schemaVersion: 1,
    texliveVersion,
    profile: { ...profile },
    files: [...acc.files.values()],
    notFound: [...acc.notFound.values()],
    complete: acc.complete,
  }
}
