import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

const controller = readFileSync(
  new URL('../../wasm-build/pdftex-worker.js', import.meta.url),
  'utf8',
)

function recorderReader(): (jobName: string) => string[] | null {
  const start = controller.indexOf('function readRecorderInputs(jobName)')
  const end = controller.indexOf('\nfunction mergeRecorderInputs', start)
  if (start < 0 || end < 0) throw new Error('readRecorderInputs helper not found')
  const source = controller.slice(start, end)
  const fls = [
    'PWD /work',
    'INPUT /work/main.tex',
    'INPUT /work/data/table.csv',
    'INPUT /work/assets/chart.png',
    'INPUT /work/fonts/custom.otf',
    'INPUT /tex/tex/latex/base/article.cls',
    'INPUT /work/assets/chart.png',
  ].join('\n')
  const unlink = vi.fn()
  const FS = {
    readFile: vi.fn(() => fls),
    unlink,
  }
  const build = new Function('FS', 'WORKROOT', `${source}\nreturn readRecorderInputs`) as (
    fs: typeof FS,
    workroot: string,
  ) => (jobName: string) => string[] | null
  return build(FS, '/work')
}

describe('pdfTeX recorder controller', () => {
  it('returns every recorder input without extension filtering', () => {
    expect(recorderReader()('main')).toEqual([
      '/work/main.tex',
      '/work/data/table.csv',
      '/work/assets/chart.png',
      '/work/fonts/custom.otf',
      '/tex/tex/latex/base/article.cls',
    ])
  })

  it('records the preamble phase whose reads are hidden by a cached snapshot', () => {
    const preambleRun = controller.match(
      /runMain\("pdflatex", \["-ini", "-interaction=nonstopmode",\s+"-recorder", "&pdflatex", "_preamble\.tex"\]\)/,
    )
    expect(preambleRun).not.toBeNull()
    expect(controller).toContain('mergeRecorderInputs(self._preambleInputFiles, bodyInputFiles)')
  })

  it('invalidates a cached preamble when one of its recorded project inputs changes', () => {
    const start = controller.indexOf('function recorderProjectPath(raw)')
    const end = controller.indexOf('\n// --- Preamble snapshot', start)
    if (start < 0 || end < 0) throw new Error('preamble invalidation helpers not found')
    const source = controller.slice(start, end)
    const state = {
      _preambleInputFiles: ['/work/config.tex', '/tex/article.cls'],
      _preambleFmtData: new Uint8Array([1]),
      _preambleHash: 'hash',
    }
    const build = new Function(
      'self',
      'WORKROOT',
      `${source}\nreturn invalidatePreambleForWrite`,
    ) as (self: typeof state, workroot: string) => (filename: string) => void
    const invalidate = build(state, '/work')

    invalidate('chapters/body.tex')
    expect(state._preambleFmtData).not.toBeNull()
    invalidate('./config.tex')
    expect(state).toMatchObject({
      _preambleInputFiles: null,
      _preambleFmtData: null,
      _preambleHash: '',
    })
  })
})
