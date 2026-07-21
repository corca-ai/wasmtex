#!/usr/bin/env node
/**
 * Generate the LuaLaTeX warmup manifest (`src/engine/luatex-manifest.ts`).
 *
 * Runs a representative fontspec document through the real LuaLaTeX engine (with
 * the prebuilt-format fast path), capturing every TeX Live file the worker
 * fetches on a cold compile. Files that 200 become `LUATEX_PRELOAD` (prefetched
 * in parallel + injected so the worker never blocks on them); 404/403 lookups
 * become `LUATEX_KNOWN_404` (pre-seeded so their XHR is skipped).
 *
 * Regenerate when the engine or its runtime (luaotfload/lualibs) changes.
 *
 * Usage: node scripts/gen-luatex-manifest.mjs [version]   (default 2025)
 * Requires the `wasmtex-luatex.worker.js` controller plus its generated
 * `wasmtex-luatex.js`, `.wasm`, and `.fmt` assets under public/wasmtex/<version>/.
 */
import { execSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const version = process.argv[2] ?? '2025'
const outPath = join(root, 'src/engine/luatex-manifest.ts')

if (!existsSync(join(root, `public/wasmtex/${version}/wasmtex-luatex.fmt`))) {
  console.error('Missing wasmtex-luatex.fmt — run scripts/extract-luatex-format.mjs first.')
  process.exit(1)
}

const DOC = [
  '% !TEX program = lualatex',
  '\\documentclass{article}',
  '\\usepackage{fontspec}',
  '\\setmainfont{Latin Modern Roman}',
  '\\usepackage{amsmath}',
  '\\begin{document}',
  'Warmup manifest generation. \\[ E = mc^2, \\sum_{n=1}^\\infty \\frac1{n^2} = \\frac{\\pi^2}6. \\]',
  '\\end{document}',
  '',
].join('\n')

/** Mirror of resolveCdn() in luatex-worker.js: CDN dir by extension. */
function cdnDir(reqname, format) {
  const l = reqname.toLowerCase()
  if (l.endsWith('.lua')) return '51'
  if (l.endsWith('.otf')) return '47'
  if (l.endsWith('.ttf') || l.endsWith('.ttc')) return '36'
  if (l.endsWith('.pfb')) return '32'
  if (l.endsWith('.afm')) return '4'
  if (l.endsWith('.tfm')) return '3'
  return String(format)
}

/** Empty-manifest stub so the capture run does NO warmup (otherwise the engine
 *  preloads the files we're trying to observe, and they never get fetched). */
const EMPTY_MANIFEST = `export interface LuatexPreloadEntry { format: number; name: string; dir: string }
export interface LuatexNotFoundEntry { format: number; filename: string }
export const LUATEX_PRELOAD: LuatexPreloadEntry[] = []
export const LUATEX_KNOWN_404: LuatexNotFoundEntry[] = []
`

async function main() {
  // Reset to empty BEFORE the server reads it, so this script is idempotent.
  writeFileSync(outPath, EMPTY_MANIFEST)
  const server = await createServer({ root, configFile: join(root, 'vite.config.ts') })
  await server.listen()
  const url = `http://localhost:${server.httpServer.address().port}`
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto(url)

  const downloads = await page.evaluate(async (doc) => {
    const captured = []
    const Real = self.Worker
    // @ts-ignore
    self.Worker = class extends Real {
      constructor(...args) {
        super(...args)
        this.addEventListener('message', (e) => {
          const d = e.data
          if (d && d.cmd === 'downloading') {
            captured.push({
              format: d.format,
              file: d.file,
              cdnFile: d.cdnFile || d.file,
              cdnDir: d.cdnDir,
              found: !!d.found,
            })
          }
        })
      }
    }
    const { WasmTexCompiler } = await import('/src/headless.ts')
    const c = new WasmTexCompiler({ engine: 'lualatex', files: { 'main.tex': doc } })
    await c.init()
    await c.compile()
    c.dispose()
    return captured
  }, DOC)

  await browser.close()
  await server.close()

  // Dedupe by (format, requested file). Preload uses the ACTUAL resolved CDN key
  // (cdnDir/cdnFile) the worker reported — the extension-retry may resolve e.g.
  // cmr12.tfm -> cmr12, and the warmup must prefetch the URL that 200s, not the
  // requested name (which 403s). Misses are keyed by the requested name (cache key).
  const seen = new Set()
  const preload = []
  const notFound = []
  for (const d of downloads) {
    // Drop lookups with no numeric kpse format — they can't form a valid cache
    // key and are rare 404s the bloom filter handles anyway.
    if (!Number.isInteger(d.format) || d.format < 0) continue
    const key = `${d.format}/${d.file}`
    if (seen.has(key)) continue
    seen.add(key)
    if (d.found) {
      const name = d.cdnFile || d.file
      const dir = d.cdnDir || cdnDir(name, d.format)
      preload.push({ format: d.format, name, dir })
    } else {
      notFound.push({ format: d.format, filename: d.file })
    }
  }
  // The luaotfload names DB is fetched directly by the worker (injectLuaotfloadNames),
  // not via kpse, so a compile-capture never observes it. Seed it explicitly so warmup
  // prefetches it in parallel (and dumpcache then persists it cross-session).
  if (!preload.some((e) => e.dir === '51' && e.name === 'luaotfload-names.lua')) {
    preload.push({ format: 51, name: 'luaotfload-names.lua', dir: '51' })
  }

  preload.sort((a, b) => a.dir.localeCompare(b.dir) || a.name.localeCompare(b.name))
  notFound.sort((a, b) => a.format - b.format || a.filename.localeCompare(b.filename))

  const body = `/**
 * LuaLaTeX warmup manifest — TeX Live files a cold first compile fetches.
 *
 * After the prebuilt-format fast path (no \`compileformat\`), the dominant cost of
 * a first LuaLaTeX compile is the worker fetching its runtime synchronously, one
 * file at a time, over the network (luaotfload + lualibs Lua runtime, font TFM/
 * OTF, …). The engine prefetches these in parallel (overlapping worker boot) and
 * injects them via \`preloadtexlive\`, so the worker finds them locally and never
 * blocks on sync XHR. Known-missing lookups are pre-seeded via \`preload404\`.
 *
 * GENERATED by scripts/gen-luatex-manifest.mjs — do not edit by hand. \`dir\` is
 * the CDN format directory (by file extension); \`name\` is the requested/saved
 * filename and \`format\` the kpse format number — both must match
 * \`kpse_find_file_impl\` so a preloaded file is a cache hit.
 */

export interface LuatexPreloadEntry {
  format: number
  name: string
  dir: string
}

export interface LuatexNotFoundEntry {
  format: number
  filename: string
}

/** Files that return 200 and are fetched during a first compile (prefetch these). */
export const LUATEX_PRELOAD: LuatexPreloadEntry[] = [
${preload.map((e) => `  { format: ${e.format}, name: '${e.name}', dir: '${e.dir}' },`).join('\n')}
]

/** Lookups that 404/403 during a first compile (pre-seed to skip wasted XHR). */
export const LUATEX_KNOWN_404: LuatexNotFoundEntry[] = [
${notFound.map((e) => `  { format: ${e.format}, filename: '${e.filename}' },`).join('\n')}
]
`
  writeFileSync(outPath, body)
  // Normalize to the repo's Biome style so a regenerated manifest stays lint-clean.
  execSync(`npx biome format --write ${outPath}`, { cwd: root, stdio: 'ignore' })
  console.log(
    `wrote ${outPath}: ${preload.length} preload + ${notFound.length} known-404 ` +
      `(from ${downloads.length} fetches)`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
