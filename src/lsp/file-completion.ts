import type { VirtualFS } from '../fs/virtual-fs'
import type { CompletionValueKind } from './package-db'
import type { NeutralCompletionItem } from './protocol'

export type ProjectFileCompletionKind = Extract<
  CompletionValueKind,
  | 'project-tex'
  | 'project-bib'
  | 'project-image'
  | 'project-listing'
  | 'project-data'
  | 'project-file'
>

const EXTENSIONS: Record<ProjectFileCompletionKind, ReadonlySet<string> | null> = {
  'project-tex': new Set(['tex']),
  'project-bib': new Set(['bib']),
  'project-image': new Set(['pdf', 'png', 'jpg', 'jpeg', 'eps', 'svg', 'webp']),
  'project-listing': new Set([
    'tex',
    'txt',
    'md',
    'c',
    'h',
    'cpp',
    'py',
    'js',
    'ts',
    'tsx',
    'jsx',
    'rs',
    'go',
    'java',
    'kt',
    'sh',
    'bash',
    'zsh',
    'rb',
    'php',
    'swift',
    'scala',
    'sql',
    'html',
    'css',
    'xml',
    'json',
    'yaml',
    'yml',
    'toml',
    'ini',
    'conf',
    'm',
    'mm',
    'r',
    'lua',
    'pl',
    'hs',
  ]),
  'project-data': new Set(['csv', 'tsv', 'dat', 'txt', 'json', 'xml', 'yaml', 'yml']),
  'project-file': null,
}

function extension(path: string): string {
  const dot = path.lastIndexOf('.')
  return dot < 0 ? '' : path.slice(dot + 1).toLowerCase()
}

function compatible(path: string, kind: ProjectFileCompletionKind): boolean {
  const extensions = EXTENSIONS[kind]
  return extensions === null || extensions.has(extension(path))
}

function dirname(path: string): string[] {
  return path.split('/').slice(0, -1).filter(Boolean)
}

function relativePath(fromFile: string, target: string): string {
  const from = dirname(fromFile)
  const to = target.split('/').filter(Boolean)
  let shared = 0
  while (shared < from.length && shared < to.length && from[shared] === to[shared]) shared++
  return [...Array.from({ length: from.length - shared }, () => '..'), ...to.slice(shared)].join(
    '/',
  )
}

function styledPath(path: string, documentPath: string, prefix: string): string | null {
  if (prefix.startsWith('/')) {
    const rooted = `/${path}`
    return rooted.startsWith(prefix) ? rooted : null
  }
  const relative = relativePath(documentPath, path)
  if (prefix.startsWith('./')) {
    const explicit = relative.startsWith('../') ? relative : `./${relative}`
    return explicit.startsWith(prefix) ? explicit : null
  }
  if (prefix.startsWith('../')) return relative.startsWith(prefix) ? relative : null
  if (path.startsWith(prefix)) return path
  return relative.startsWith(prefix) ? relative : null
}

/** Complete compatible host-owned project files while preserving the typed path style. */
export function completeProjectFiles(
  kind: ProjectFileCompletionKind,
  prefix: string,
  documentPath: string,
  fs: VirtualFS,
): NeutralCompletionItem[] {
  const seen = new Set<string>()
  const items: NeutralCompletionItem[] = []
  for (const path of fs.listFiles().sort()) {
    if (!compatible(path, kind)) continue
    const insertText = styledPath(path, documentPath, prefix)
    if (insertText === null || seen.has(insertText)) continue
    seen.add(insertText)
    items.push({
      label: insertText,
      kind: 'file',
      insertText,
      detail: `Project file: ${path}`,
      sortText: `0_${insertText}`,
      replaceLength: prefix.length,
    })
  }
  return items
}
