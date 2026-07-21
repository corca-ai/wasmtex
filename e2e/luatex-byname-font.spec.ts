import { expect, test } from '@playwright/test'

/**
 * LuaLaTeX by-name font resolution (#61). Proves the prebuilt luaotfload names DB
 * works end-to-end: `\setmainfont{Latin Modern Roman}` (a HUMAN name) must resolve
 * to the actual Latin Modern OpenType font instead of silently falling back to
 * Computer Modern.
 *
 * Deterministic signal = CDN traffic (no PDF parsing needed):
 *   - the worker fetches the names DB         → /51/luaotfload-names.lua
 *   - luaotfload resolves the name via kpse    -> /47/lmroman<...>.otf
 * The CM fallback would instead fetch cmr/cmmi TFMs and NO lmroman OTF.
 *
 * Requires the engine BUILT WITH the worker change (injectLuaotfloadNames) deployed
 * to public/wasmtex/2025/, and the DB live on the CDN.
 */

const APP_URL = 'http://localhost:6001'
const CDN_HOST = 'd1jectpaw0dlvl.cloudfront.net'

const BYNAME_DOC = [
  '% !TEX program = lualatex',
  '\\documentclass{article}',
  '\\usepackage{fontspec}',
  '\\setmainfont{Latin Modern Roman}',
  '\\begin{document}',
  'By-name font resolution test.',
  '\\end{document}',
  '',
].join('\n')

test.describe('LuaLaTeX by-name font resolution (#61)', () => {
  test.setTimeout(240_000)

  test('\\setmainfont{Latin Modern Roman} resolves to the LM OpenType font', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    const cdnUrls: string[] = []
    page.on('response', (resp) => {
      const url = resp.url()
      if (url.includes(CDN_HOST) && resp.status() === 200) cdnUrls.push(url)
    })

    await page.goto(APP_URL)
    const r = await page.evaluate(async (doc) => {
      const mod = await import('/src/headless.ts')
      // @ts-ignore - dev-server module shape
      const c = new mod.WasmTexCompiler({ engine: 'lualatex', files: { 'main.tex': doc } })
      await c.init()
      const res = await c.compile()
      c.dispose()
      return { ok: res.success && !!res.pdf }
    }, BYNAME_DOC)

    const dbFetched = cdnUrls.some((u) => u.includes('/51/luaotfload-names.lua'))
    const lmFetched = cdnUrls.some((u) => /\/47\/lmroman.*\.otf/i.test(u))
    // eslint-disable-next-line no-console
    console.log(
      `[byname] ok=${r.ok} dbFetched=${dbFetched} lmFetched=${lmFetched}\n` +
        cdnUrls
          .filter((u) => /luaotfload-names|lmroman|cmr|cmmi/i.test(u))
          .map((u) => '  ' + u.split(CDN_HOST)[1])
          .join('\n'),
    )

    expect(r.ok).toBe(true)
    expect(dbFetched).toBe(true) // names DB was injected + fetched
    expect(lmFetched).toBe(true) // by-name resolved to the real Latin Modern font
    await context.close()
  })

  // CJK (Korean) by-name — the consumer's actual use case in #61. UnBatang is a
  // plain .ttf on the mirror (no .ttc subfont complication); resolving it by name
  // proves the DB path works for CJK families, not just Latin.
  test('\\setmainfont{UnBatang} (Korean) resolves to the real TrueType font', async ({
    browser,
  }) => {
    const doc = [
      '% !TEX program = lualatex',
      '\\documentclass{article}',
      '\\usepackage{fontspec}',
      '\\setmainfont{UnBatang}',
      '\\begin{document}',
      '\\char"D55C\\char"AE00 by-name CJK test.', // 한글 (avoid non-ASCII in the spec source)
      '\\end{document}',
      '',
    ].join('\n')
    const context = await browser.newContext()
    const page = await context.newPage()
    const cdnUrls: string[] = []
    page.on('response', (resp) => {
      const url = resp.url()
      if (url.includes(CDN_HOST) && resp.status() === 200) cdnUrls.push(url)
    })

    await page.goto(APP_URL)
    const r = await page.evaluate(async (d) => {
      const mod = await import('/src/headless.ts')
      // @ts-ignore - dev-server module shape
      const c = new mod.WasmTexCompiler({ engine: 'lualatex', files: { 'main.tex': d } })
      await c.init()
      const res = await c.compile()
      c.dispose()
      return { ok: res.success && !!res.pdf }
    }, doc)

    const unbatangFetched = cdnUrls.some((u) => /\/36\/unbatang\.ttf/i.test(u))
    // eslint-disable-next-line no-console
    console.log(`[byname-cjk] ok=${r.ok} unbatangFetched=${unbatangFetched}`)

    expect(r.ok).toBe(true)
    expect(unbatangFetched).toBe(true) // Korean family resolved by name to UnBatang.ttf
    await context.close()
  })

  // The names DB now rides texlive200, so dumpcache persists it: a return visit
  // (same context, durable cache warm) must NOT re-fetch it from the CDN.
  test('names DB is persisted cross-session (no re-fetch on return visit)', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(APP_URL)

    // Visit 1 — cold; populates the durable IndexedDB cache (incl. the names DB).
    await page.evaluate(async (doc) => {
      const mod = await import('/src/headless.ts')
      // @ts-ignore - dev-server module shape
      const c = new mod.WasmTexCompiler({ engine: 'lualatex', persistentCache: true, files: { 'main.tex': doc } })
      await c.init()
      await c.compile()
      await new Promise((res) => setTimeout(res, 3000)) // let IndexedDB persist settle
      c.dispose()
    }, BYNAME_DOC)

    // Visit 2 — same context (durable cache warm). Watch for a DB re-fetch.
    let dbRefetched = false
    page.on('response', (resp) => {
      if (resp.url().includes('/51/luaotfload-names.lua')) dbRefetched = true
    })
    const r = await page.evaluate(async (doc) => {
      const mod = await import('/src/headless.ts')
      // @ts-ignore - dev-server module shape
      const c = new mod.WasmTexCompiler({ engine: 'lualatex', persistentCache: true, files: { 'main.tex': doc } })
      await c.init()
      const res = await c.compile()
      c.dispose()
      return { ok: res.success && !!res.pdf }
    }, BYNAME_DOC)

    // eslint-disable-next-line no-console
    console.log(`[byname-cache] return-visit ok=${r.ok} dbRefetched=${dbRefetched}`)
    expect(r.ok).toBe(true)
    expect(dbRefetched).toBe(false) // restored from IndexedDB, not re-fetched
    await context.close()
  })

  // A by-name MISS (font not in the DB) must fall back cleanly to Computer Modern and
  // still produce a PDF — not hang on a futile rescan. `update-live = false` (written by
  // the worker) ensures the miss falls back immediately instead of rebuilding the DB.
  test('a by-name miss falls back cleanly (no hang) and still compiles', async ({ browser }) => {
    const doc = [
      '% !TEX program = lualatex',
      '\\documentclass{article}',
      '\\usepackage{fontspec}',
      '\\setmainfont{ThisFontDefinitelyDoesNotExist12345}',
      '\\begin{document}',
      'Miss falls back to Computer Modern.',
      '\\end{document}',
      '',
    ].join('\n')
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(APP_URL)
    const t0 = Date.now()
    const r = await page.evaluate(async (d) => {
      const mod = await import('/src/headless.ts')
      // @ts-ignore - dev-server module shape
      const c = new mod.WasmTexCompiler({ engine: 'lualatex', files: { 'main.tex': d } })
      await c.init()
      const res = await c.compile()
      c.dispose()
      return { ok: res.success && !!res.pdf }
    }, doc)
    // eslint-disable-next-line no-console
    console.log(`[byname-miss] ok=${r.ok} elapsed=${Date.now() - t0}ms`)
    expect(r.ok).toBe(true) // compiles despite the missing font (clean CM fallback)
    await context.close()
  })
})
