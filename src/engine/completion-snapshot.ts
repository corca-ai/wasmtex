import type {
  CompletionSnapshot,
  CompletionSnapshotCollection,
  CompletionSnapshotCommand,
  CompletionSnapshotEngine,
  CompletionSnapshotFieldName,
  CompletionSnapshotFields,
  CompletionSnapshotIdentity,
  CompletionSnapshotKeyFamily,
  CompletionSnapshotProfile,
  CompletionSnapshotResource,
  CompletionSnapshotValue,
} from '../types'

export const COMPLETION_SNAPSHOT_SCHEMA_VERSION = 1 as const
export const COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES = 2 * 1024 * 1024

const LIMITS = {
  commands: 8192,
  environments: 1024,
  values: 1024,
  keyFamilies: 512,
  keys: 2048,
  loadedResources: 2048,
  nameLength: 128,
  pathLength: 512,
  rawObservations: 16384,
} as const

const FIELD_NAMES: CompletionSnapshotFieldName[] = [
  'commands',
  'environments',
  'colors',
  'counters',
  'lengths',
  'keyFamilies',
  'loadedResources',
]

const ENVIRONMENT_BLOCKLIST = new Set(['csname', 'group', 'input', 'linechar', 'write'])

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export interface CompletionSnapshotProjectFile {
  path: string
  content: string | Uint8Array
}

/** Bounded, engine-private observations produced after a normal engine pass. */
export interface EngineCompletionObservation {
  counters: string[]
  colors: string[]
  keyFamilies: Array<{ name: string; keys: string[] }>
  complete: boolean
  fieldCompleteness?: { counters: boolean; colors: boolean; keyFamilies: boolean }
  dropped?: { counters: number; colors: number; keyFamilies: number }
}

export interface CreateCompletionSnapshotOptions {
  engine: CompletionSnapshotEngine
  root: string
  profile: CompletionSnapshotProfile
  projectFiles: Iterable<CompletionSnapshotProjectFile>
  engineCommands?: readonly string[]
  engineCommandsComplete?: boolean
  engineCommandsDropped?: number
  engineObservation?: EngineCompletionObservation
  inputFiles?: readonly string[]
  inputFilesComplete?: boolean
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function sha256(value: string | Uint8Array): Promise<string> {
  const bytes: Uint8Array<ArrayBuffer> =
    typeof value === 'string' ? new TextEncoder().encode(value) : Uint8Array.from(value)
  return hex(await crypto.subtle.digest('SHA-256', bytes))
}

/** Hash paths, content kinds, and bytes without concatenating the whole project in memory. */
export async function completionProjectRevision(
  files: Iterable<CompletionSnapshotProjectFile>,
): Promise<string> {
  const sorted = [...files].sort((a, b) => compareText(a.path, b.path))
  const records: string[] = []
  for (const file of sorted) {
    const kind = typeof file.content === 'string' ? 'text' : 'binary'
    records.push(`${JSON.stringify(file.path)}\t${kind}\t${await sha256(file.content)}`)
  }
  return `sha256:${await sha256(records.join('\n'))}`
}

function safeText(value: unknown, maxLength: number): string | null {
  // Reject oversized boundary data before trim/replace can allocate another
  // attacker-controlled string. Being stricter about surrounding whitespace is
  // intentional: protocol values never need padding beyond the field limit.
  if (typeof value !== 'string' || value.length > maxLength) return null
  const normalized = value.trim().replaceAll('\\', '/')
  const hasControl = [...normalized].some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127
  })
  if (!normalized || normalized.length > maxLength || hasControl) {
    return null
  }
  return normalized
}

function safeName(value: unknown): string | null {
  return safeText(value, LIMITS.nameLength)
}

function unsupported<T>(reason: string): CompletionSnapshotCollection<T> {
  return { status: 'unsupported', complete: false, values: [], reason }
}

function observed<T>(
  values: T[],
  complete: boolean,
  dropped = 0,
  reason?: string,
): CompletionSnapshotCollection<T> {
  return {
    status: 'observed',
    complete: complete && dropped === 0,
    values,
    ...(reason ? { reason } : {}),
    ...(dropped > 0 ? { truncated: true, dropped } : {}),
  }
}

function boundedUnique(
  input: Iterable<unknown>,
  limit: number,
  map: (value: unknown) => string | null = safeName,
): { values: string[]; dropped: number } {
  const values = new Set<string>()
  let dropped = 0
  for (const raw of input) {
    const value = map(raw)
    if (!value) {
      dropped++
      continue
    }
    if (values.has(value)) continue
    if (values.size >= limit) dropped++
    else values.add(value)
  }
  return { values: [...values].sort(compareText), dropped }
}

interface ParsedEngineCommand {
  name: string
  eqType: number
  argCount: number
}

function safeEngineCommandName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const robustWrapper = value.endsWith(' ')
  const name = safeName(robustWrapper ? value.slice(0, -1) : value)
  return name ? `${name}${robustWrapper ? ' ' : ''}` : null
}

function parseEngineCommand(raw: unknown): ParsedEngineCommand | null {
  if (typeof raw !== 'string' || raw.length > LIMITS.nameLength + 32) return null
  const [rawName, rawEqType, rawArgCount, extra] = raw.split('\t')
  if (extra !== undefined) return null
  const name = safeEngineCommandName(rawName)
  if (!name || /[@_:]/.test(name)) return null
  const eqType = rawEqType === undefined ? -1 : Number.parseInt(rawEqType, 10)
  const argCount = rawArgCount === undefined ? -1 : Number.parseInt(rawArgCount, 10)
  return {
    name,
    eqType: Number.isFinite(eqType) ? eqType : -1,
    argCount: Number.isFinite(argCount) ? Math.max(-1, Math.min(9, argCount)) : -1,
  }
}

function commandCollection(
  input: readonly string[] | undefined,
  complete: boolean,
  initialDropped: number,
): CompletionSnapshotCollection<CompletionSnapshotCommand> {
  if (!input) return unsupported('engine command observation is unavailable')
  const commands = new Map<string, ParsedEngineCommand>()
  let dropped = Math.max(0, initialDropped) + Math.max(0, input.length - LIMITS.rawObservations)
  for (const raw of input.slice(0, LIMITS.rawObservations)) {
    const command = parseEngineCommand(raw)
    if (command) commands.set(command.name, command)
    else dropped++
  }
  for (const command of commands.values()) {
    if (!command.name.endsWith(' ') || command.argCount <= 0) continue
    const base = commands.get(command.name.trimEnd())
    if (base && base.argCount <= 0) base.argCount = command.argCount
  }
  const sorted = [...commands.values()]
    .filter((command) => !command.name.endsWith(' '))
    .sort((a, b) => compareText(a.name, b.name))
  if (sorted.length > LIMITS.commands) dropped += sorted.length - LIMITS.commands
  return observed(
    sorted.slice(0, LIMITS.commands).map((command) => ({
      ...command,
      evidence: 'engine-hash-table' as const,
    })),
    complete,
    dropped,
    complete ? undefined : 'the engine did not report complete command coverage',
  )
}

function environmentCollection(
  commands: CompletionSnapshotCollection<CompletionSnapshotCommand>,
): CompletionSnapshotCollection<CompletionSnapshotValue> {
  if (commands.status === 'unsupported') {
    return unsupported('environment observation requires engine command observation')
  }
  const names = new Set(commands.values.map((command) => command.name))
  const environments = [...names]
    .filter(
      (name) =>
        name.startsWith('end') &&
        !ENVIRONMENT_BLOCKLIST.has(name.slice(3)) &&
        names.has(name.slice(3)),
    )
    .map((name) => name.slice(3))
  const bounded = boundedUnique(environments, LIMITS.environments)
  return observed(
    bounded.values.map((name) => ({ name, evidence: 'engine-hash-table' as const })),
    commands.complete,
    bounded.dropped,
  )
}

function valueCollection(
  input: readonly string[] | undefined,
  supported: boolean,
  complete: boolean,
  reason: string,
  initialDropped = 0,
): CompletionSnapshotCollection<CompletionSnapshotValue> {
  if (!supported || !input) return unsupported(reason)
  const inspected = input.slice(0, LIMITS.rawObservations)
  const bounded = boundedUnique(inspected, LIMITS.values)
  return observed(
    bounded.values.map((name) => ({ name, evidence: 'engine-hash-table' as const })),
    complete,
    bounded.dropped + Math.max(0, input.length - inspected.length) + Math.max(0, initialDropped),
  )
}

function keyFamilyCollection(
  input: EngineCompletionObservation['keyFamilies'] | undefined,
  complete: boolean,
  initialDropped = 0,
): CompletionSnapshotCollection<CompletionSnapshotKeyFamily> {
  if (!input) return unsupported('key-family observation is unavailable for this engine')
  const families = new Map<string, Set<string>>()
  let dropped = Math.max(0, initialDropped) + Math.max(0, input.length - LIMITS.rawObservations)
  let remainingRawKeys = LIMITS.rawObservations
  for (const raw of input.slice(0, LIMITS.rawObservations)) {
    const name = safeName(raw.name)
    if (!name) {
      dropped++
      continue
    }
    const keys = families.get(name) ?? new Set<string>()
    families.set(name, keys)
    const rawKeys = Array.isArray(raw.keys) ? raw.keys : []
    const inspectedKeys = rawKeys.slice(0, remainingRawKeys)
    remainingRawKeys -= inspectedKeys.length
    dropped += rawKeys.length - inspectedKeys.length
    for (const rawKey of inspectedKeys) {
      const key = safeName(rawKey)
      if (key) keys.add(key)
      else dropped++
    }
  }
  const sorted = [...families].sort(([a], [b]) => compareText(a, b))
  const selected = sorted.slice(0, LIMITS.keyFamilies)
  dropped += sorted
    .slice(LIMITS.keyFamilies)
    .reduce((count, [, keys]) => count + Math.max(1, keys.size), 0)
  let remainingKeys = LIMITS.keys
  const values = selected.map(([name, keys]) => {
    const sortedKeys = [...keys].sort(compareText)
    const kept = sortedKeys.slice(0, remainingKeys)
    dropped += sortedKeys.length - kept.length
    remainingKeys -= kept.length
    return {
      name,
      evidence: 'engine-hash-table' as const,
      keys: kept.map((key) => ({ name: key, evidence: 'engine-hash-table' as const })),
    }
  })
  return observed(values, complete, dropped)
}

function resourceCollection(
  input: readonly string[] | undefined,
  complete: boolean,
): CompletionSnapshotCollection<CompletionSnapshotResource> {
  if (!input) return unsupported('recorder input observation is unavailable')
  const inspected = input.slice(0, LIMITS.rawObservations)
  const bounded = boundedUnique(inspected, LIMITS.loadedResources, (value) =>
    safeText(value, LIMITS.pathLength),
  )
  return observed(
    bounded.values.map((path) => ({ path, evidence: 'recorder' as const })),
    complete,
    bounded.dropped + Math.max(0, input.length - inspected.length),
    complete ? undefined : 'the engine recorder reported incomplete coverage',
  )
}

function estimate(snapshot: CompletionSnapshot): number {
  // Reserve the full digit width of any allowed final value so assigning
  // `estimatedBytes` cannot push the retained payload back over the ceiling.
  return (
    JSON.stringify({
      ...snapshot,
      estimatedBytes: COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES,
    }).length * 2
  )
}

function trimCollection(collection: CompletionSnapshotCollection<unknown>, count: number): void {
  if (collection.values.length === 0) return
  const removed = Math.min(count, collection.values.length)
  collection.values.splice(collection.values.length - removed, removed)
  collection.complete = false
  collection.truncated = true
  collection.dropped = (collection.dropped ?? 0) + removed
}

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`completion snapshot has an invalid ${label}`)
  }
  return value as UnknownRecord
}

function requiredText(value: unknown, maxLength: number, label: string): string {
  const text = safeText(value, maxLength)
  if (!text) throw new Error(`completion snapshot has an invalid ${label}`)
  return text
}

function collectionHeader(
  value: unknown,
  field: CompletionSnapshotFieldName,
): {
  values: unknown[]
  status: 'observed' | 'unsupported'
  complete: boolean
  reason?: string
  dropped: number
  truncated: boolean
} {
  const record = asRecord(value, `${field} field`)
  if (record.status !== 'observed' && record.status !== 'unsupported') {
    throw new Error(`completion snapshot has an invalid ${field} status`)
  }
  if (!Array.isArray(record.values) || typeof record.complete !== 'boolean') {
    throw new Error(`completion snapshot has an invalid ${field} collection`)
  }
  const reason = record.reason === undefined ? undefined : safeText(record.reason, 256)
  const dropped =
    Number.isSafeInteger(record.dropped) && (record.dropped as number) >= 0
      ? (record.dropped as number)
      : 0
  return {
    values: record.values,
    status: record.status,
    complete: record.complete,
    ...(reason ? { reason } : {}),
    dropped,
    truncated: record.truncated === true,
  }
}

function normalizeCollection<T>(
  value: unknown,
  field: CompletionSnapshotFieldName,
  limit: number,
  parse: (value: unknown) => { key: string; value: T } | null,
): CompletionSnapshotCollection<T> {
  const header = collectionHeader(value, field)
  if (header.status === 'unsupported') {
    if (header.values.length > 0) {
      throw new Error(`unsupported completion snapshot field ${field} contains values`)
    }
    return unsupported(header.reason ?? `${field} observation is unavailable`)
  }
  const selected = new Map<string, T>()
  const inspected = Math.min(header.values.length, LIMITS.rawObservations)
  let dropped = header.dropped + Math.max(0, header.values.length - inspected)
  for (let index = 0; index < inspected; index++) {
    const parsed = parse(header.values[index])
    if (!parsed) {
      dropped++
      continue
    }
    if (!selected.has(parsed.key)) selected.set(parsed.key, parsed.value)
  }
  const sorted = [...selected].sort(([a], [b]) => compareText(a, b))
  dropped += Math.max(0, sorted.length - limit)
  const normalized = observed(
    sorted.slice(0, limit).map(([, item]) => item),
    header.complete,
    dropped,
    header.reason,
  )
  if (header.truncated) {
    normalized.complete = false
    normalized.truncated = true
  }
  return normalized
}

function parseCommandValue(
  value: unknown,
): { key: string; value: CompletionSnapshotCommand } | null {
  const record =
    value && typeof value === 'object' && !Array.isArray(value) ? asRecord(value, 'command') : null
  if (!record) return null
  const name = safeName(record.name)
  if (
    !name ||
    /[@_:]/.test(name) ||
    !Number.isSafeInteger(record.eqType) ||
    !Number.isSafeInteger(record.argCount) ||
    (record.argCount as number) < -1 ||
    (record.argCount as number) > 9 ||
    record.evidence !== 'engine-hash-table'
  ) {
    return null
  }
  return {
    key: name,
    value: {
      name,
      eqType: record.eqType as number,
      argCount: record.argCount as number,
      evidence: 'engine-hash-table',
    },
  }
}

function parseNamedValue(value: unknown): { key: string; value: CompletionSnapshotValue } | null {
  const record =
    value && typeof value === 'object' && !Array.isArray(value) ? asRecord(value, 'value') : null
  if (!record || record.evidence !== 'engine-hash-table') return null
  const name = safeName(record.name)
  return name ? { key: name, value: { name, evidence: 'engine-hash-table' } } : null
}

function parseKeyName(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = asRecord(value, 'key')
  if (record.evidence !== 'engine-hash-table') return null
  return safeName(record.name)
}

function parseKeyFamily(
  value: unknown,
  inspectionLimit: number,
): { name: string; keys: string[]; dropped: number; inspected: number } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = asRecord(value, 'key family')
  const name = safeName(record.name)
  if (record.evidence !== 'engine-hash-table' || !name || !Array.isArray(record.keys)) return null
  const inspected = Math.min(record.keys.length, inspectionLimit)
  let dropped = Math.max(0, record.keys.length - inspected)
  const keys = new Set<string>()
  for (let index = 0; index < inspected; index++) {
    const key = parseKeyName(record.keys[index])
    if (key) keys.add(key)
    else dropped++
  }
  return { name, keys: [...keys], dropped, inspected }
}

function normalizeKeyFamilies(
  value: unknown,
): CompletionSnapshotCollection<CompletionSnapshotKeyFamily> {
  const header = collectionHeader(value, 'keyFamilies')
  if (header.status === 'unsupported') {
    if (header.values.length > 0) {
      throw new Error('unsupported completion snapshot field keyFamilies contains values')
    }
    return unsupported(header.reason ?? 'key-family observation is unavailable')
  }
  const families = new Map<string, Set<string>>()
  const inspected = Math.min(header.values.length, LIMITS.rawObservations)
  let dropped = header.dropped + Math.max(0, header.values.length - inspected)
  let remainingRawKeys = LIMITS.rawObservations
  for (let index = 0; index < inspected; index++) {
    const parsed = parseKeyFamily(header.values[index], remainingRawKeys)
    if (!parsed) {
      dropped++
      continue
    }
    remainingRawKeys -= parsed.inspected
    const keys = families.get(parsed.name) ?? new Set<string>()
    families.set(parsed.name, keys)
    for (const key of parsed.keys) keys.add(key)
    dropped += parsed.dropped
  }
  const sorted = [...families].sort(([a], [b]) => compareText(a, b))
  dropped += sorted
    .slice(LIMITS.keyFamilies)
    .reduce((total, [, keys]) => total + Math.max(1, keys.size), 0)
  let remainingKeys = LIMITS.keys
  const values = sorted.slice(0, LIMITS.keyFamilies).map(([name, keys]) => {
    const sortedKeys = [...keys].sort(compareText)
    const selected = sortedKeys.slice(0, remainingKeys)
    dropped += sortedKeys.length - selected.length
    remainingKeys -= selected.length
    return {
      name,
      evidence: 'engine-hash-table' as const,
      keys: selected.map((key) => ({ name: key, evidence: 'engine-hash-table' as const })),
    }
  })
  const normalized = observed(values, header.complete, dropped, header.reason)
  if (header.truncated) {
    normalized.complete = false
    normalized.truncated = true
  }
  return normalized
}

function normalizeResourceCollection(
  value: unknown,
): CompletionSnapshotCollection<CompletionSnapshotResource> {
  return normalizeCollection(value, 'loadedResources', LIMITS.loadedResources, (raw) => {
    const record =
      raw && typeof raw === 'object' && !Array.isArray(raw) ? asRecord(raw, 'resource') : null
    if (!record || record.evidence !== 'recorder') return null
    const path = safeText(record.path, LIMITS.pathLength)
    return path ? { key: path, value: { path, evidence: 'recorder' } } : null
  })
}

/** Validate and bound snapshots before retaining data received across a host/RPC boundary. */
export function boundCompletionSnapshot(snapshot: CompletionSnapshot): CompletionSnapshot {
  const source = asRecord(snapshot, 'root')
  if (source.version !== COMPLETION_SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(`unsupported completion snapshot version: ${String(source.version)}`)
  }
  const rawIdentity = asRecord(source.identity, 'identity')
  const projectRevision = requiredText(rawIdentity.projectRevision, 80, 'project revision')
  if (!/^sha256:[a-f0-9]{64}$/.test(projectRevision)) {
    throw new Error('completion snapshot has an invalid project revision')
  }
  if (!['pdflatex', 'xelatex', 'lualatex'].includes(String(rawIdentity.engine))) {
    throw new Error('completion snapshot has an invalid engine')
  }
  const rawProfile = asRecord(rawIdentity.profile, 'profile')
  if (rawProfile.texliveYear !== '2025') {
    throw new Error('completion snapshot has an invalid TeX Live year')
  }
  const mirrorRevision =
    rawProfile.mirrorRevision === null
      ? null
      : requiredText(rawProfile.mirrorRevision, 256, 'mirror revision')
  const rawFields = asRecord(source.fields, 'fields')
  const copy: CompletionSnapshot = {
    version: 1,
    identity: {
      projectRevision,
      engine: rawIdentity.engine as CompletionSnapshotEngine,
      root: requiredText(rawIdentity.root, LIMITS.pathLength, 'root path'),
      profile: {
        id: requiredText(rawProfile.id, LIMITS.pathLength, 'profile id'),
        texliveYear: '2025',
        mirrorRevision,
      },
    },
    fields: {
      commands: normalizeCollection(
        rawFields.commands,
        'commands',
        LIMITS.commands,
        parseCommandValue,
      ),
      environments: normalizeCollection(
        rawFields.environments,
        'environments',
        LIMITS.environments,
        parseNamedValue,
      ),
      colors: normalizeCollection(rawFields.colors, 'colors', LIMITS.values, parseNamedValue),
      counters: normalizeCollection(rawFields.counters, 'counters', LIMITS.values, parseNamedValue),
      lengths: normalizeCollection(rawFields.lengths, 'lengths', LIMITS.values, parseNamedValue),
      keyFamilies: normalizeKeyFamilies(rawFields.keyFamilies),
      loadedResources: normalizeResourceCollection(rawFields.loadedResources),
    },
    estimatedBytes: 0,
  }
  let bytes = estimate(copy)
  while (bytes > COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES) {
    const populated = FIELD_NAMES.map((name) => copy.fields[name]).filter(
      (collection) => collection.values.length > 0,
    )
    if (populated.length === 0) break
    const largest = populated.sort((a, b) => b.values.length - a.values.length)[0]!
    trimCollection(largest, Math.max(1, Math.ceil(largest.values.length / 8)))
    bytes = estimate(copy)
  }
  copy.estimatedBytes = bytes
  return copy
}

export async function createCompletionSnapshot(
  options: CreateCompletionSnapshotOptions,
): Promise<CompletionSnapshot> {
  const identity: CompletionSnapshotIdentity = {
    projectRevision: await completionProjectRevision(options.projectFiles),
    engine: options.engine,
    root: options.root,
    profile: { ...options.profile },
  }
  const commands = commandCollection(
    options.engineCommands,
    options.engineCommandsComplete === true,
    options.engineCommandsDropped ?? 0,
  )
  const observation = options.engineObservation
  const observationDropped = observation?.dropped
  const observationComplete = observation?.fieldCompleteness
  const fields: CompletionSnapshotFields = {
    commands,
    environments: environmentCollection(commands),
    colors: valueCollection(
      observation?.colors,
      !!observation,
      observationComplete?.colors ?? observation?.complete === true,
      'color observation is unavailable for this engine',
      observationDropped?.colors,
    ),
    counters: valueCollection(
      observation?.counters,
      !!observation,
      observationComplete?.counters ?? observation?.complete === true,
      'counter observation is unavailable for this engine',
      observationDropped?.counters,
    ),
    lengths: unsupported('length-register observation is unavailable for this engine'),
    keyFamilies: keyFamilyCollection(
      observation?.keyFamilies,
      observationComplete?.keyFamilies ?? observation?.complete === true,
      observationDropped?.keyFamilies,
    ),
    loadedResources: resourceCollection(options.inputFiles, options.inputFilesComplete === true),
  }
  return boundCompletionSnapshot({ version: 1, identity, fields, estimatedBytes: 0 })
}

type ParsedObservationLine =
  | { kind: 'counter'; name: string }
  | { kind: 'color'; name: string }
  | { kind: 'key'; family: string; name: string }
  | { kind: 'meta'; field: 'counters' | 'colors' | 'keyFamilies'; dropped: number }

const OBSERVATION_META_FIELDS: Record<string, 'counters' | 'colors' | 'keyFamilies' | undefined> = {
  counter: 'counters',
  color: 'colors',
  key: 'keyFamilies',
}

function parseObservationMeta(
  first: string | undefined,
  second: string | undefined,
): ParsedObservationLine | null {
  const field = first ? OBSERVATION_META_FIELDS[first] : undefined
  const dropped = /^\d+$/.test(second ?? '') ? Number(second) : Number.NaN
  return field && Number.isSafeInteger(dropped) && dropped >= 0
    ? { kind: 'meta', field, dropped }
    : null
}

function parseObservationLine(line: unknown): ParsedObservationLine | null {
  if (typeof line !== 'string') return null
  if (line.length > LIMITS.nameLength * 2 + 32) return null
  const [kind, first, second] = line.split('\t')
  if (kind === 'meta') return parseObservationMeta(first, second)
  const firstName = safeName(first)
  if ((kind === 'counter' || kind === 'color') && firstName) {
    return { kind, name: firstName }
  }
  const secondName = safeName(second)
  return kind === 'key' && firstName && secondName
    ? { kind: 'key', family: firstName, name: secondName }
    : null
}

function rejectedObservationField(line: unknown): 'counters' | 'colors' | 'keyFamilies' | null {
  if (typeof line !== 'string') return null
  const tab = line.indexOf('\t')
  const kind = tab >= 0 ? line.slice(0, tab) : ''
  return kind === 'counter'
    ? 'counters'
    : kind === 'color'
      ? 'colors'
      : kind === 'key'
        ? 'keyFamilies'
        : null
}

function collectObservation(
  parsed: ParsedObservationLine,
  counters: string[],
  colors: string[],
  keys: Map<string, string[]>,
  dropped: { counters: number; colors: number; keyFamilies: number },
  metadataSeen: { counters: boolean; colors: boolean; keyFamilies: boolean },
): void {
  if (parsed.kind === 'counter') counters.push(parsed.name)
  else if (parsed.kind === 'color') colors.push(parsed.name)
  else if (parsed.kind === 'key') {
    const values = keys.get(parsed.family) ?? []
    values.push(parsed.name)
    keys.set(parsed.family, values)
  } else {
    dropped[parsed.field] = parsed.dropped
    metadataSeen[parsed.field] = true
  }
}

/** Parse the authored pdfTeX controller's bounded tab-delimited observation file. */
export function parseEngineCompletionObservation(
  lines: readonly unknown[],
): EngineCompletionObservation {
  const counters: string[] = []
  const colors: string[] = []
  const keys = new Map<string, string[]>()
  const dropped = { counters: 0, colors: 0, keyFamilies: 0 }
  const hostDropped = { counters: 0, colors: 0, keyFamilies: 0 }
  const metadataSeen = { counters: false, colors: false, keyFamilies: false }
  let unclassifiedRejected = false
  const withinHostLimit = lines.length <= LIMITS.rawObservations
  const limited = lines.slice(0, LIMITS.rawObservations)
  for (const line of limited) {
    const parsed = parseObservationLine(line)
    if (!parsed) {
      const field = rejectedObservationField(line)
      if (field) hostDropped[field]++
      else unclassifiedRejected = true
      continue
    }
    collectObservation(parsed, counters, colors, keys, dropped, metadataSeen)
  }
  dropped.counters += hostDropped.counters
  dropped.colors += hostDropped.colors
  dropped.keyFamilies += hostDropped.keyFamilies
  const complete =
    withinHostLimit &&
    !unclassifiedRejected &&
    metadataSeen.counters &&
    metadataSeen.colors &&
    metadataSeen.keyFamilies &&
    dropped.counters === 0 &&
    dropped.colors === 0 &&
    dropped.keyFamilies === 0
  const fieldCompleteness = {
    counters:
      withinHostLimit && !unclassifiedRejected && metadataSeen.counters && dropped.counters === 0,
    colors: withinHostLimit && !unclassifiedRejected && metadataSeen.colors && dropped.colors === 0,
    keyFamilies:
      withinHostLimit &&
      !unclassifiedRejected &&
      metadataSeen.keyFamilies &&
      dropped.keyFamilies === 0,
  }
  return {
    counters,
    colors,
    keyFamilies: [...keys].map(([name, familyKeys]) => ({ name, keys: familyKeys })),
    complete,
    fieldCompleteness,
    dropped,
  }
}
