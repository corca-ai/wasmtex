import { expect, test } from '@playwright/test'

/**
 * LuaLaTeX cold-start benchmark — the measurement tool for the LuaLaTeX
 * first-compile optimization series (#1 prebuilt .fmt, #2 bloom+warmup,
 * #3 persistent cache, #4 luaotfload cache, #5 preamble snapshot).
 *
 * Each iteration runs in a FRESH browser context (isolated HTTP cache), so the
 * first compile pays the true cold cost: WASM load + format build (compileformat)
 * + synchronous CDN fetches + luaotfload font resolution.
 *
 * Reported per run:
 *   - initMs         : WasmTexCompiler.init()  (worker load + settexliveurl)
 *   - firstCompileMs : first compile()           (ensureFormat + compilelatex)
 *   - secondCompileMs: second compile()          (fmt cached in-mem; ~warm cost)
 *   - cdn200 / cdn4xx: CDN responses observed during init+firstCompile
 * Derived:
 *   - format+fetchMs ≈ firstCompileMs - secondCompileMs  (what #1/#2 target)
 */

const APP_URL = 'http://localhost:6001'
const ITERATIONS = Number(process.env.LUA_BENCH_ITERS ?? 5)
const CDN_HOST = 'd1jectpaw0dlvl.cloudfront.net'

const LUA_DOC = [
  '% !TEX program = lualatex',
  '\\documentclass{article}',
  '\\usepackage{fontspec}',
  '\\setmainfont{Latin Modern Roman}',
  '\\usepackage{amsmath}',
  '\\begin{document}',
  'Cold-start benchmark for LuaLaTeX.',
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
  const median = s[Math.floor(s.length / 2)]!
  return { median: Math.round(median), min: Math.round(s[0]!), max: Math.round(s[s.length - 1]!) }
}

test.describe('LuaLaTeX cold-start benchmark', () => {
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
        // @ts-ignore - dev-server module path
        const mod = await import('/src/headless.ts')
        const { WasmTexCompiler } = mod as {
          WasmTexCompiler: new (o: unknown) => {
            init(): Promise<void>
            compile(): Promise<{ success: boolean; pdf: Uint8Array | null }>
            dispose(): void
          }
        }
        const compiler = new WasmTexCompiler({
          engine: 'lualatex',
          files: { 'main.tex': doc },
        })
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
      }, LUA_DOC)

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
    const fmtCost = stats(samples.map((s) => s.firstCompileMs - s.secondCompileMs))
    const cdn200 = stats(samples.map((s) => s.cdn200))
    const cdn4xx = stats(samples.map((s) => s.cdn4xx))

    // eslint-disable-next-line no-console
    console.log(
      [
        '',
        '╔════════════════════════════════════════════════════════════╗',
        `║  LuaLaTeX cold-start benchmark  (n=${ITERATIONS}, public CDN)`.padEnd(61) + '║',
        '╠════════════════════════════════════════════════════════════╣',
        `║  TIME TO FIRST PDF (init+first) median=${ttfp.median}ms [${ttfp.min}–${ttfp.max}]`.padEnd(
          61,
        ) + '║',
        `║  init           median=${init.median}ms  [${init.min}–${init.max}]`.padEnd(61) + '║',
        `║  first compile  median=${first.median}ms  [${first.min}–${first.max}]`.padEnd(61) + '║',
        `║  second compile median=${second.median}ms  [${second.min}–${second.max}]`.padEnd(61) + '║',
        `║  ~format+fetch  median=${fmtCost.median}ms  [${fmtCost.min}–${fmtCost.max}]`.padEnd(61) + '║',
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

  // Persistent cache (#3): a return visit rehydrates the durable IndexedDB cache
  // and should do ~zero CDN network. Both visits run in the SAME context so the
  // IndexedDB store persists between them.
  test('persistent cache: return visit does ~zero CDN network', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(APP_URL)

    // Visit 1 — cold, populates the durable cache. Wait for the (non-blocking)
    // persist to finish before tearing down.
    const v1 = await page.evaluate(async (doc) => {
      const mod = await import('/src/headless.ts')
      // @ts-ignore - dev-server module shape
      const c = new mod.WasmTexCompiler({
        engine: 'lualatex',
        persistentCache: true,
        files: { 'main.tex': doc },
      })
      await c.init()
      const r = await c.compile()
      await new Promise((res) => setTimeout(res, 3000)) // let IndexedDB persist settle
      c.dispose()
      return { ok: r.success && !!r.pdf }
    }, LUA_DOC)
    expect(v1.ok).toBe(true)

    // Visit 2 — same context (durable cache present). Count CDN requests.
    let cdn = 0
    page.on('response', (resp) => {
      if (resp.url().includes(CDN_HOST)) cdn++
    })
    const v2 = await page.evaluate(async (doc) => {
      const mod = await import('/src/headless.ts')
      // @ts-ignore - dev-server module shape
      const c = new mod.WasmTexCompiler({
        engine: 'lualatex',
        persistentCache: true,
        files: { 'main.tex': doc },
      })
      const t0 = performance.now()
      await c.init()
      const r = await c.compile()
      const ttfp = performance.now() - t0
      c.dispose()
      return { ttfp, ok: r.success && !!r.pdf }
    }, LUA_DOC)

    // eslint-disable-next-line no-console
    console.log(
      `[persistent-cache] return visit: time-to-first-PDF=${Math.round(v2.ttfp)}ms, ` +
        `CDN requests=${cdn}`,
    )
    expect(v2.ok).toBe(true)
    // A warm durable cache should serve everything locally: near-zero CDN.
    expect(cdn).toBeLessThan(20)
    await context.close()
  })
})
