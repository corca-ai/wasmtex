#!/usr/bin/env node
// Per-engine compile benchmark (pdfLaTeX / XeLaTeX / LuaLaTeX): cold + warm timings
// on a representative math/text document, plus the warm "base floor" (trivial doc) that
// isolates fixed per-compile overhead from typesetting. Headless, no engine rebuild.
//   node scripts/bench-engines.mjs
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.'
const sec = (i) =>
  `\\section{Section ${i}}\n${Array.from({ length: 6 }, () => LOREM).join('\n\n')}\n\\begin{equation} E_{${i}}=\\sum_{k=1}^{${i}}\\frac{k^2}{\\sqrt{k+1}} \\end{equation}\n`
const N = 40
const pre = (e) =>
  e === 'pdflatex'
    ? '\\documentclass{article}\\usepackage{amsmath}\n'
    : `% !TEX program = ${e}\n\\documentclass{article}\\usepackage{amsmath}\\usepackage{fontspec}\\setmainfont{Latin Modern Roman}\n`
const heavy = (e) => `${pre(e)}\\begin{document}\n${Array.from({ length: N }, (_, i) => sec(i + 1)).join('\n')}\n\\end{document}\n`
const trivial = (e) => `${pre(e)}\\begin{document}\nHello world.\n\\end{document}\n`

const server = await createServer({ root, configFile: join(root, 'vite.config.ts') })
await server.listen()
const { port } = server.httpServer.address()
const browser = await chromium.launch()
try {
  console.log(`engine     cold    warm   base(trivial)`)
  for (const e of ['pdflatex', 'xelatex', 'lualatex']) {
    const page = await browser.newPage()
    try {
      await page.goto(`http://localhost:${port}`)
      const r = await page.evaluate(
        async ({ e, heavy, trivial }) => {
          const { WasmTexCompiler } = await import('/src/headless.ts')
          const run = async (doc) => {
            const c = new WasmTexCompiler({
              texliveVersion: '2025',
              engine: e,
              files: { 'main.tex': doc },
            })
            try {
              await c.init()
              const t0 = performance.now()
              await c.compile()
              const cold = Math.round(performance.now() - t0)
              const t1 = performance.now()
              await c.compile()
              return { cold, warm: Math.round(performance.now() - t1) }
            } finally {
              c.dispose()
            }
          }
          const h = await run(heavy)
          const b = await run(trivial)
          return { cold: h.cold, warm: h.warm, base: b.warm }
        },
        { e, heavy: heavy(e), trivial: trivial(e) },
      )
      console.log(
        `${e.padEnd(10)} ${String(r.cold).padStart(5)}ms ${String(r.warm).padStart(5)}ms ${String(r.base).padStart(8)}ms`,
      )
    } finally {
      await page.close()
    }
  }
} finally {
  await browser.close()
  await server.close()
}
