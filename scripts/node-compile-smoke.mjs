// Node compile smoke (#121): run the WASM pdfTeX engine off-browser and produce a PDF.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WasmTexCompiler, installNodeWorkerHost } from '../lib/node.js'
import { defaultTexliveUrl } from './lib/default-texlive-mirrors.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ASSET = 'http://assets.local/'
installNodeWorkerHost({
  publicDir: process.env.WASMTEX_SMOKE_PUBLIC_DIR ?? join(root, 'public'),
  assetBaseUrl: ASSET,
})

const doc = '\\documentclass{article}\n\\begin{document}\nHello from Node + WASM. $E=mc^2$.\n\\end{document}\n'
const c = new WasmTexCompiler({
  engine: 'pdflatex',
  texliveVersion: process.env.WASMTEX_SMOKE_TEXLIVE_VERSION ?? '2025',
  assetBaseUrl: ASSET,
  texliveUrl:
    process.env.WASMTEX_SMOKE_TEXLIVE_URL ?? defaultTexliveUrl('2025'),
  files: { 'main.tex': doc },
})
const t0 = Date.now()
await c.init()
console.log('init ok in', Date.now() - t0, 'ms')
const r = await c.compile()
console.log('--- result ---')
console.log('success:', r.success, '| pdf bytes:', r.pdf ? r.pdf.length : 0, '| errors:', r.errors?.length ?? 0)
console.log((r.log || '').split('\n').slice(-12).join('\n'))
if (typeof c.dispose === 'function') c.dispose()
process.exit(r.success && r.pdf && r.pdf.length > 0 ? 0 : 1)
