import type {
  CompletionSnapshotProfile,
  ResolverAttempt,
  ResolverAttemptOutcome,
  ResolverAttemptSource,
  ResolverEvidence,
  ResolverEvidenceReport,
  ResolverStage,
} from '../types'

const MAX_ENTRIES = 256
const MAX_ATTEMPTS = 8
const SOURCES = new Set<ResolverAttemptSource>([
  'warmup-cache',
  'persistent-cache',
  'session-cache',
  'warmup-negative',
  'durable-negative',
  'bloom-filter',
  'network',
])
const ATTEMPT_OUTCOMES = new Set<ResolverAttemptOutcome>(['hit', 'not-found', 'transport-error'])
const FINAL_OUTCOMES = new Set<ResolverEvidence['outcome']>([
  'resolved',
  'mirror-absent',
  'transport-error',
])

export interface RawResolverEvidence {
  requestedName?: unknown
  format?: unknown
  outcome?: unknown
  attempts?: unknown
}

function isSafeResourceName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 512 &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !/[\r\n\0]/.test(value)
  )
}

function parseAttempt(value: unknown): ResolverAttempt | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (!SOURCES.has(raw.source as ResolverAttemptSource)) return null
  if (!ATTEMPT_OUTCOMES.has(raw.outcome as ResolverAttemptOutcome)) return null
  const attempt: ResolverAttempt = {
    source: raw.source as ResolverAttemptSource,
    outcome: raw.outcome as ResolverAttemptOutcome,
  }
  if (isSafeResourceName(raw.candidate)) {
    attempt.candidate = raw.candidate
  }
  if (
    typeof raw.status === 'number' &&
    Number.isSafeInteger(raw.status) &&
    raw.status >= 100 &&
    raw.status <= 599
  ) {
    attempt.status = raw.status
  }
  return attempt
}

function parseEntry(stage: ResolverStage, raw: RawResolverEvidence): ResolverEvidence | null {
  if (
    !isSafeResourceName(raw.requestedName) ||
    typeof raw.format !== 'number' ||
    !Number.isSafeInteger(raw.format) ||
    raw.format < 0 ||
    !FINAL_OUTCOMES.has(raw.outcome as ResolverEvidence['outcome']) ||
    !Array.isArray(raw.attempts)
  ) {
    return null
  }
  const attempts = raw.attempts.slice(0, MAX_ATTEMPTS).map(parseAttempt)
  if (attempts.some((attempt) => attempt === null) || attempts.length === 0) return null
  return {
    stage,
    requestedName: raw.requestedName,
    format: raw.format,
    outcome: raw.outcome as ResolverEvidence['outcome'],
    attempts: attempts as ResolverAttempt[],
  }
}

/** Per-driver, per-command collector for untrusted worker messages. Entries are
 *  keyed by stage/format/request so retries update one final outcome instead of
 *  producing contradictory results. */
export class ResolverEvidenceCollector {
  private supported = false
  private active = false
  private readonly entries = new Map<string, ResolverEvidence>()
  private dropped = 0

  constructor(
    private readonly stage: ResolverStage,
    private readonly profile: CompletionSnapshotProfile,
  ) {}

  markSupported(): void {
    this.supported = true
  }

  begin(): void {
    this.active = true
    this.entries.clear()
    this.dropped = 0
  }

  record(raw: RawResolverEvidence): void {
    if (!this.active) return
    const entry = parseEntry(this.stage, raw)
    if (!entry) return
    const key = `${entry.stage}\0${entry.format}\0${entry.requestedName}`
    if (!this.entries.has(key) && this.entries.size >= MAX_ENTRIES) {
      this.dropped++
      return
    }
    this.entries.set(key, entry)
  }

  finish(): ResolverEvidenceReport | undefined {
    this.active = false
    if (!this.supported) return undefined
    return {
      schemaVersion: 1,
      profile: { ...this.profile },
      entries: [...this.entries.values()],
      dropped: this.dropped,
      complete: this.dropped === 0,
    }
  }
}

export function mergeResolverReports(
  profile: CompletionSnapshotProfile,
  reports: ReadonlyArray<ResolverEvidenceReport | undefined>,
): ResolverEvidenceReport {
  const entries: ResolverEvidence[] = []
  let dropped = 0
  for (const report of reports) {
    if (!report) continue
    dropped += report.dropped
    for (const entry of report.entries) {
      if (entries.length < MAX_ENTRIES) entries.push(entry)
      else dropped++
    }
  }
  return {
    schemaVersion: 1,
    profile: { ...profile },
    entries,
    dropped,
    complete: dropped === 0,
  }
}
