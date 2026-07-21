import { expect, test } from '@playwright/test'

/**
 * XeLaTeX cold-start benchmark — measures the first-compile cost for the XeLaTeX
 * (XeTeX → dvipdfmx) pipeline. Each iteration runs in a FRESH browser context
 * (isolated HTTP cache), so the first compile pays the true cold cost: WASM load
 * + format build (`compileformat`) + synchronous CDN fetches + dvipdfmx font embed.
 *
 * Mirrors e2e/luatex-coldstart-benchmark.spec.ts. Used to evaluate shipping a
 * prebuilt `wasmtex-xetex.fmt` (skip the per-session format build).
 */

const APP_URL = 'http://localhost:6001'
const ITERATIONS = Number(process.env.XE_BENCH_ITERS ?? 5)
const CDN_HOST = 'd1jectpaw0dlvl.cloudfront.net'

const XE_DOC = [
  '% !TEX program = xelatex',
  '\\documentclass{article}',
  '\\usepackage{fontspec}',
  '\\setmainfont{Latin Modern Roman}',
  '\\usepackage{amsmath}',
  '\\begin{document}',
  'Cold-start benchmark for XeLaTeX.',
  '\\[ E = mc^2, \\qquad \\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}. \\]',
  '\\end{document}',
  '',
].join('\n')

interface Sample {
  initMs: number
  firstCompileMs: number
  secondCompileMs: number
  firstOk: boolean
  secondOk: boolean
  cdn200: number
  cdn4xx: number
}

function stats(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b)
  return {
    median: Math.round(s[Math.floor(s.length / 2)]!),
    min: Math.round(s[0]!),
    max: Math.round(s[s.length - 1]!),
  }
}

test.describe('XeLaTeX cold-start benchmark', () => {
  test.setTimeout(180_000 + ITERATIONS * 120_000)

  test('measure init + first/second compile across fresh contexts', async ({ browser }) => {
    const samples: Sample[] = []

    for (let i = 0; i < ITERATIONS; i++) {
      const context = await browser.newContext()
      const page = await context.newPage()
      let cdn200 = 0
      let cdn4xx = 0
      page.on('response', (resp) => {
        const url = resp.url()
        if (!url.includes(CDN_HOST)) return
        const s = resp.status()
        if (s >= 200 && s < 300) cdn200++
        else if (s >= 400) cdn4xx++
      })

      await page.goto(APP_URL)

      const r = await page.evaluate(async (doc) => {
        const mod = await import('/src/headless.ts')
        // @ts-ignore - dev-server module shape
        const compiler = new mod.WasmTexCompiler({ engine: 'xelatex', files: { 'main.tex': doc } })
        const t0 = performance.now()
        await compiler.init()
        const initMs = performance.now() - t0
        const t1 = performance.now()
        const c1 = await compiler.compile()
        const firstCompileMs = performance.now() - t1
        const t2 = performance.now()
        const c2 = await compiler.compile()
        const secondCompileMs = performance.now() - t2
        compiler.dispose()
        return {
          initMs,
          firstCompileMs,
          secondCompileMs,
          firstOk: c1.success && !!c1.pdf,
          secondOk: c2.success && !!c2.pdf,
        }
      }, XE_DOC)

      samples.push({ ...r, cdn200, cdn4xx })
      // eslint-disable-next-line no-console
      console.log(
        `[run ${i + 1}/${ITERATIONS}] init=${Math.round(r.initMs)}ms ` +
          `first=${Math.round(r.firstCompileMs)}ms second=${Math.round(r.secondCompileMs)}ms ` +
          `ok=${r.firstOk}/${r.secondOk} cdn=${cdn200}+${cdn4xx}`,
      )
      await context.close()
    }

    const init = stats(samples.map((s) => s.initMs))
    const first = stats(samples.map((s) => s.firstCompileMs))
    const ttfp = stats(samples.map((s) => s.initMs + s.firstCompileMs))
    const second = stats(samples.map((s) => s.secondCompileMs))
    const cdn200 = stats(samples.map((s) => s.cdn200))
    const cdn4xx = stats(samples.map((s) => s.cdn4xx))

    // eslint-disable-next-line no-console
    console.log(
      [
        '',
        '╔════════════════════════════════════════════════════════════╗',
        `║  XeLaTeX cold-start benchmark  (n=${ITERATIONS}, public CDN)`.padEnd(61) + '║',
        '╠════════════════════════════════════════════════════════════╣',
        `║  TIME TO FIRST PDF (init+first) median=${ttfp.median}ms [${ttfp.min}–${ttfp.max}]`.padEnd(
          61,
        ) + '║',
        `║  init           median=${init.median}ms  [${init.min}–${init.max}]`.padEnd(61) + '║',
        `║  first compile  median=${first.median}ms  [${first.min}–${first.max}]`.padEnd(61) + '║',
        `║  second compile median=${second.median}ms  [${second.min}–${second.max}]`.padEnd(61) + '║',
        `║  CDN 200        median=${cdn200.median}  [${cdn200.min}–${cdn200.max}]`.padEnd(61) + '║',
        `║  CDN 4xx        median=${cdn4xx.median}  [${cdn4xx.min}–${cdn4xx.max}]`.padEnd(61) + '║',
        '╚════════════════════════════════════════════════════════════╝',
      ].join('\n'),
    )

    for (const s of samples) {
      expect(s.firstOk).toBe(true)
      expect(s.secondOk).toBe(true)
    }
  })
})
