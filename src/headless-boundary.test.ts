import { describe, expect, it } from 'vitest'

/**
 * Headless-boundary guard (S1 / #108, execution-model principle 4).
 *
 * The core must be **fully headless**: the `wasmtex/headless`, `wasmtex/lsp`, and
 * `wasmtex/lsp/server` entry points must not transitively import `monaco-editor` or any
 * UI module (`src/editor`, `src/ui`, `src/viewer`). The browser component (`wasmtex`,
 * via `src/index.ts` / `src/wasmtex.ts`) is where UI lives — it is intentionally NOT a
 * headless entry and is excluded here.
 *
 * This fails loudly the moment a UI/monaco dependency leaks into the core, so the
 * client/server-portable surface (the same engine on any host) stays clean. See
 * `docs/execution-model.md`.
 */

// Every source file as raw text (Vite/vitest feature, typed by vite/client). Avoids
// node:fs so the test stays inside the browser-typed `src` tsconfig.
const RAW = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const HEADLESS_ENTRIES = ['/src/headless.ts', '/src/lsp-service.ts', '/src/lsp-server.ts']
const FORBIDDEN_BARE = /^monaco-editor(\/|$)/
const FORBIDDEN_DIR = /^\/src\/(editor|ui|viewer)\//

/** Resolve a relative import specifier to a key in RAW, or null if non-relative/unknown. */
function resolveKey(spec: string, fromKey: string): string | null {
  if (!spec.startsWith('.')) return null
  const fromDir = fromKey.slice(0, fromKey.lastIndexOf('/'))
  const stack: string[] = []
  for (const part of `${fromDir}/${spec}`.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  const base = `/${stack.join('/')}`
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    if (cand in RAW) return cand
  }
  return null
}

function importSpecifiers(src: string): string[] {
  // Strip block + line comments first (keep `://` so URLs in code aren't truncated), so
  // a `from '…'` in prose isn't mistaken for an import — and, crucially, so MULTI-LINE
  // imports (`import {\n …\n} from '…'`) are caught: every `from '…'` is an import/
  // export-from. Missing those is how a monaco dependency can hide from this guard.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  const out: string[] = []
  for (const m of code.matchAll(/\bfrom\s*["']([^"']+)["']/g)) out.push(m[1] as string)
  for (const m of code.matchAll(/\bimport\s*\(\s*["']([^"']+)["']/g)) out.push(m[1] as string)
  for (const m of code.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) out.push(m[1] as string)
  return out
}

function buildChain(parent: Map<string, string | null>, file: string, leaf: string): string[] {
  const chain = [leaf]
  let cur: string | null = file
  while (cur) {
    chain.push(cur)
    cur = parent.get(cur) ?? null
  }
  return chain.reverse()
}

type ImportClass = { kind: 'violation' } | { kind: 'follow'; key: string } | { kind: 'ignore' }

/** Classify one import specifier: a forbidden dep, a module to follow, or ignorable. */
function classify(spec: string, fromKey: string): ImportClass {
  const resolved = resolveKey(spec, fromKey)
  if (!resolved) return FORBIDDEN_BARE.test(spec) ? { kind: 'violation' } : { kind: 'ignore' }
  if (FORBIDDEN_DIR.test(resolved)) return { kind: 'violation' }
  return { kind: 'follow', key: resolved }
}

/** First violating import chain reachable from `entry`, or null if clean. */
function findViolation(entry: string): string[] | null {
  const parent = new Map<string, string | null>([[entry, null]])
  const stack = [entry]
  while (stack.length) {
    const key = stack.pop() as string
    const src = RAW[key]
    if (src === undefined) continue
    for (const spec of importSpecifiers(src)) {
      const c = classify(spec, key)
      if (c.kind === 'violation') return buildChain(parent, key, spec)
      if (c.kind === 'follow' && !parent.has(c.key)) {
        parent.set(c.key, key)
        stack.push(c.key)
      }
    }
  }
  return null
}

describe('headless boundary (#108)', () => {
  for (const entry of HEADLESS_ENTRIES) {
    it(`${entry} does not reach monaco-editor or any UI module`, () => {
      const violation = findViolation(entry)
      const message = violation
        ? `Headless entry "${entry}" reaches a UI/monaco dependency:\n  ${violation.join(
            '\n  → ',
          )}\nCore must stay headless — move UI types/code out of core (docs/execution-model.md).`
        : ''
      expect(violation, message).toBeNull()
    })
  }
})
