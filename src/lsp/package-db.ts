/**
 * Package-aware command intelligence.
 *
 * Derives argument signatures (required vs optional, with placeholders) from the
 * bundled command database in `latex-commands.ts`, and provides the source
 * package for each command. This is a wasmtex-authored dataset (the snippet
 * DB), so there are no third-party licensing constraints (we intentionally do
 * NOT bundle the GPL CWL corpus). For packages outside the bundled core, a small
 * per-package shard can be fetched lazily — see {@link PackageShardLoader}.
 */
import { getCommandByName } from './latex-commands'

/** Semantic value domains understood by the completion resolver registry. */
export type CompletionValueKind =
  | 'tex-class'
  | 'tex-package'
  | 'bib-style'
  | 'biblatex-style'
  | 'project-tex'
  | 'project-bib'
  | 'project-image'
  | 'project-file'
  | 'font-family'
  | 'color'
  | 'label'
  | 'citation'
  | 'environment'
  | 'counter'
  | 'length'
  | 'glossary-key'
  | 'acronym-key'
  | 'enum'
  | 'key-value'
  | 'free-text'

export interface CommandArg {
  kind: 'required' | 'optional'
  /** The snippet placeholder text, e.g. `text` from `${1:text}` (may be empty). */
  placeholder?: string
  /** Semantic domain used to resolve completion values for this argument. */
  valueKind?: CompletionValueKind
  /** The argument contains a comma-separated list of values or key/value pairs. */
  list?: boolean
  /** Named key family used to resolve keys and their typed values. */
  keyFamily?: string
  /**
   * Signature index of the argument that selects this argument's resource scope.
   * For example, document-class options point at the following class-name argument.
   */
  selectorArgumentIndex?: number
}

const optional = (
  placeholder: string,
  valueKind: CompletionValueKind,
  extra: Pick<CommandArg, 'keyFamily' | 'list' | 'selectorArgumentIndex'> = {},
): CommandArg => ({ kind: 'optional', placeholder, valueKind, ...extra })

const required = (
  placeholder: string,
  valueKind: CompletionValueKind,
  extra: Pick<CommandArg, 'keyFamily' | 'list' | 'selectorArgumentIndex'> = {},
): CommandArg => ({ kind: 'required', placeholder, valueKind, ...extra })

/**
 * Typed signatures for kernel and widely shared command forms. Snippet signatures remain
 * the fallback for presentation-only arguments; this table adds semantic meaning and models
 * optional arguments omitted from the compact command snippets.
 */
const builtinTypedSignatures = new Map<string, CommandArg[]>([
  [
    'documentclass',
    [
      optional('options', 'key-value', {
        keyFamily: 'class-options',
        list: true,
        selectorArgumentIndex: 1,
      }),
      required('class', 'tex-class'),
    ],
  ],
  [
    'LoadClass',
    [
      optional('options', 'key-value', {
        keyFamily: 'class-options',
        list: true,
        selectorArgumentIndex: 1,
      }),
      required('class', 'tex-class'),
    ],
  ],
  [
    'usepackage',
    [
      optional('options', 'key-value', {
        keyFamily: 'package-options',
        list: true,
        selectorArgumentIndex: 1,
      }),
      required('packages', 'tex-package', { list: true }),
    ],
  ],
  [
    'RequirePackage',
    [
      optional('options', 'key-value', {
        keyFamily: 'package-options',
        list: true,
        selectorArgumentIndex: 1,
      }),
      required('packages', 'tex-package', { list: true }),
    ],
  ],
  ['begin', [required('environment', 'environment')]],
  ['end', [required('environment', 'environment')]],
  ['ref', [required('label', 'label', { list: true })]],
  ['eqref', [required('label', 'label', { list: true })]],
  ['pageref', [required('label', 'label', { list: true })]],
  ['autoref', [required('label', 'label', { list: true })]],
  ['cref', [required('labels', 'label', { list: true })]],
  ['Cref', [required('labels', 'label', { list: true })]],
  ['nameref', [required('label', 'label', { list: true })]],
  [
    'cite',
    [
      optional('prenote', 'free-text'),
      optional('postnote', 'free-text'),
      required('keys', 'citation', { list: true }),
    ],
  ],
  [
    'citep',
    [
      optional('prenote', 'free-text'),
      optional('postnote', 'free-text'),
      required('keys', 'citation', { list: true }),
    ],
  ],
  [
    'citet',
    [
      optional('prenote', 'free-text'),
      optional('postnote', 'free-text'),
      required('keys', 'citation', { list: true }),
    ],
  ],
  [
    'parencite',
    [
      optional('prenote', 'free-text'),
      optional('postnote', 'free-text'),
      required('keys', 'citation', { list: true }),
    ],
  ],
  [
    'textcite',
    [
      optional('prenote', 'free-text'),
      optional('postnote', 'free-text'),
      required('keys', 'citation', { list: true }),
    ],
  ],
  [
    'autocite',
    [
      optional('prenote', 'free-text'),
      optional('postnote', 'free-text'),
      required('keys', 'citation', { list: true }),
    ],
  ],
  ['nocite', [required('keys', 'citation', { list: true })]],
  ['input', [required('file', 'project-tex')]],
  ['include', [required('file', 'project-tex')]],
  ['subfile', [required('file', 'project-tex')]],
  ['bibliography', [required('files', 'project-bib', { list: true })]],
  ['bibliographystyle', [required('style', 'bib-style')]],
  [
    'setmainfont',
    [
      optional('options', 'key-value', { keyFamily: 'fontspec/font', list: true }),
      required('font', 'font-family'),
    ],
  ],
  [
    'setsansfont',
    [
      optional('options', 'key-value', { keyFamily: 'fontspec/font', list: true }),
      required('font', 'font-family'),
    ],
  ],
  [
    'setmonofont',
    [
      optional('options', 'key-value', { keyFamily: 'fontspec/font', list: true }),
      required('font', 'font-family'),
    ],
  ],
  [
    'includegraphics',
    [
      optional('options', 'key-value', { keyFamily: 'graphicx/includegraphics', list: true }),
      required('image', 'project-image'),
    ],
  ],
])

/** Parse a snippet (`\name{$1}[$2]…`) into its argument signature. */
export function parseSignature(snippet: string): CommandArg[] {
  const args: CommandArg[] = []
  let i = snippet.startsWith('\\') ? 1 : 0
  // Skip the command name (letters, `@`, and a trailing `*`).
  while (i < snippet.length && /[a-zA-Z@*]/.test(snippet[i]!)) i++

  while (i < snippet.length) {
    while (i < snippet.length && /\s/.test(snippet[i]!)) i++
    const ch = snippet[i]
    if (ch !== '{' && ch !== '[') break
    const { content, end } = readGroup(snippet, i)
    if (content.includes('$')) {
      args.push({
        kind: ch === '{' ? 'required' : 'optional',
        placeholder: extractPlaceholder(content),
      })
    }
    i = end
  }
  return args
}

/** Read a `{...}` (brace-balanced) or `[...]` group starting at `start`. */
function readGroup(text: string, start: number): { content: string; end: number } {
  const open = text[start]
  if (open === '[') {
    const close = text.indexOf(']', start + 1)
    // When unclosed, keep the whole remainder (as the `{` case does) rather than
    // slicing `end - 1`, which would chop the last character.
    const contentEnd = close < 0 ? text.length : close
    const end = close < 0 ? text.length : close + 1
    return { content: text.slice(start + 1, contentEnd), end }
  }
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}' && --depth === 0) {
      return { content: text.slice(start + 1, i), end: i + 1 }
    }
  }
  return { content: text.slice(start + 1), end: text.length }
}

/** Extract a human placeholder from `$1`, `${1:label}`, or `$0`. */
function extractPlaceholder(content: string): string {
  const named = content.match(/\$\{\d+:([^}]*)\}/)
  if (named) return named[1]!
  return ''
}

interface ShardEntry {
  args: CommandArg[]
  package: string
  doc?: string
}

/** Commands contributed by lazily-loaded package shards (augments the bundled DB). */
const shardRegistry = new Map<string, ShardEntry>()
/** Environment names contributed by lazily-loaded package shards. */
const shardEnvironments = new Set<string>()
/** Typed environment metadata contributed by lazily-loaded package shards. */
const shardEnvironmentRegistry = new Map<string, ShardEntry>()

type ShardCommandSpec = { name: string; args?: CommandArg[]; doc?: string }

/** Register a shard's commands. Element shape is NOT guaranteed (asShard only checks the
 *  array), so a null/non-object/nameless entry is skipped — never dereferenced — so one bad
 *  element can't throw and reject the whole best-effort loadAll() batch. */
function registerShardCommands(pkg: string, commands: ShardCommandSpec[]): void {
  for (const cmd of commands) {
    if (!cmd || typeof cmd.name !== 'string') continue
    // First writer wins: a later shard contributing the same command name must not silently
    // clobber an earlier package's equally-valid entry. Mirrors the "don't shadow" rule for
    // kernel commands. Re-registering the same package's command is idempotent either way.
    if (shardRegistry.has(cmd.name)) continue
    const entry: ShardEntry = { args: cmd.args ?? [], package: pkg }
    if (cmd.doc) entry.doc = cmd.doc
    shardRegistry.set(cmd.name, entry)
  }
}

/** Register a package shard's commands (and environments) so lookups can resolve them. */
export function registerShard(shard: {
  package: string
  commands: ShardCommandSpec[]
  environments?: { name: string; args?: CommandArg[]; doc?: string }[]
}): void {
  // Defensive: a malformed shard (non-array commands/environments) must no-op rather than
  // throw — the loader already rejects these, but callers shouldn't be able to crash here.
  registerShardCommands(shard.package, Array.isArray(shard.commands) ? shard.commands : [])
  for (const env of Array.isArray(shard.environments) ? shard.environments : []) {
    if (!env || typeof env.name !== 'string') continue
    shardEnvironments.add(env.name)
    if (shardEnvironmentRegistry.has(env.name)) continue
    const entry: ShardEntry = { args: env.args ?? [], package: shard.package }
    if (env.doc) entry.doc = env.doc
    shardEnvironmentRegistry.set(env.name, entry)
  }
}

/** Environment names contributed by loaded shards (for completion / known-env checks). */
export function getShardEnvironments(): ReadonlySet<string> {
  return shardEnvironments
}

/** The argument signature for a known command (bundled DB or a loaded shard). */
export function getCommandSignature(name: string): CommandArg[] | undefined {
  const typed = builtinTypedSignatures.get(name)
  if (typed) return typed
  const cmd = getCommandByName(name)
  if (cmd) return parseSignature(cmd.snippet)
  return shardRegistry.get(name)?.args
}

/** The argument signature for a known environment contributed by a package shard. */
export function getEnvironmentSignature(name: string): CommandArg[] | undefined {
  return shardEnvironmentRegistry.get(name)?.args
}

/** The source package for a known command (undefined = LaTeX kernel / always available). */
export function getCommandPackage(name: string): string | undefined {
  // The bundled DB is authoritative: a kernel command (package undefined) must not fall
  // through to a same-named shard entry, which would shadow it with a wrong package.
  const bundled = getCommandByName(name)
  if (bundled) return bundled.package
  return shardRegistry.get(name)?.package
}

/** Render a signature like `\href{url}{text}` (placeholders) or `\frac{}{}`. */
export function formatSignature(name: string, args: CommandArg[]): string {
  const parts = args.map((a) =>
    a.kind === 'required' ? `{${a.placeholder ?? ''}}` : `[${a.placeholder ?? ''}]`,
  )
  return `\\${name}${parts.join('')}`
}
