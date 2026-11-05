import { expect, test } from '@playwright/test'

/**
 * LuaLaTeX heap checkpoints in Chromium, which the Node smoke cannot stand in for:
 * Chromium speculatively inlines indirect calls, and its stack traces then report
 * `string_read` (sscanf's reader) between `__stdio_read` and `__uflow`. The stack
 * guard refuses any frame outside the Asyncify list, so a build whose list lacks
 * that reader takes no checkpoint here. Fonts loaded through luaotfload give the
 * read call site both targets before the armed line.
 */
const year = process.env.TEXLIVE_VERSION === '2026' ? '2026' : '2025'
const mirror = year === '2026' ? '2026-d26706764b740276' : '2025-2e1df8aa17d29d66'

test('LuaLaTeX takes and resumes a heap checkpoint in Chromium', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto('/')
  const result = await page.evaluate(async ({ year, mirror }) => {
    const { WasmTexLuatexEngine } = await import('/src/engine/luatex-engine.ts')
    const normalize = (pdf: Uint8Array | null) => pdf && new TextDecoder('latin1').decode(pdf)
      .replace(/\/(?:CreationDate|ModDate)\s*\([^)]*\)/g, '')
      .replace(/\/ID\s*\[[^\]]*\]/g, '')
    const sentence = 'The preview keeps precise typography while the author edits this paragraph. '
    const section = (n: number, edit: string) =>
      `\\section{Section ${n}}\n${sentence.repeat(12)}${edit}\n` +
      `\\begin{equation} f_{${n}}(x) = \\int_0^1 \\frac{x^2}{1 + \\lambda t} \\, dt \\end{equation}\n`
    const doc = (edit = '') => [
      '% !TEX program = lualatex',
      '\\documentclass[11pt]{article}',
      '\\usepackage{fontspec}\\usepackage[margin=1in]{geometry}',
      '\\usepackage{amsmath,amssymb}\\usepackage{booktabs,xcolor}\\usepackage{hyperref}',
      '\\begin{document}',
      ...Array.from({ length: 18 }, (_, i) => section(i + 1, i === 14 ? edit : '')),
      // An argument spanning lines: the second line is read while the macro scans it.
      '\\newcommand\\spread[1]{#1}\\spread{first half',
      'second half}',
      '\\end{document}',
      '',
    ].join('\n')
    const source = doc()
    const lineOf = (text: string) => source.split('\n').indexOf(text) + 1
    const options = { texliveVersion: year as '2025' | '2026',
      texliveUrl: `https://texlive.corca.ai/snapshots/${mirror}/${year}/` }
    const lab = new WasmTexLuatexEngine({ ...options, luatexHeapCheckpoints: true })
    const reference = new WasmTexLuatexEngine(options)
    try {
      await Promise.all([lab.init(), reference.init()])
      await lab.writeFile('main.tex', source)
      const armed = await lab.compile({ checkpoints: [
        { id: 'late', line: lineOf('\\section{Section 15}') },
        { id: 'argument', line: lineOf('second half}') },
      ] })
      const edited = doc(' An edit after the checkpoint.')
      await lab.writeFile('main.tex', edited)
      await reference.writeFile('main.tex', edited)
      const resumed = armed.heapCheckpoints?.length
        ? await lab.compileFromHeapCheckpoint('late')
        : null
      const fresh = await reference.compile()
      return {
        armed: armed.success,
        held: armed.heapCheckpoints?.map((record) => record.id) ?? [],
        refusals: armed.heapCheckpointRefusals ?? [],
        resumed: resumed?.success ?? null,
        equal: normalize(resumed?.pdf ?? null) === normalize(fresh.pdf),
      }
    } finally {
      lab.terminate()
      reference.terminate()
    }
  }, { year, mirror })
  expect(result.armed).toBe(true)
  expect(result.refusals).toEqual([{ id: 'argument', reason: 'stack' }])
  expect(result.held).toEqual(['late'])
  expect(result.resumed).toBe(true)
  expect(result.equal).toBe(true)
})
