import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * TeX names its outputs after the job, not after the path it was handed. A run
 * over `paper/main.tex` writes `main.pdf`, `main.log` and `main.synctex.gz`
 * into the working directory — never `paper/main.pdf`. Every worker reads its
 * output back, so each one derives that name, and each one used to derive it
 * from the full input path: the compile succeeded, the read found nothing, and
 * the host was handed a successful log with no PDF. Only a document at the
 * project root was unaffected, because there the two names are equal.
 */
const WORKERS = ['pdftex', 'xetex', 'luatex', 'dvipdfm'] as const

function workerSource(engine: (typeof WORKERS)[number]) {
  return readFileSync(new URL(`../../wasm-build/${engine}-worker.js`, import.meta.url), 'utf8')
}

function jobNameForMain(source: string): (mainFile: string) => string {
  const start = source.indexOf('function jobNameForMain(mainFile)')
  if (start < 0) throw new Error('jobNameForMain helper not found')
  const end = source.indexOf('\n}', start) + 2
  return new Function(`${source.slice(start, end)}\nreturn jobNameForMain`)() as (
    mainFile: string,
  ) => string
}

describe('engine worker job names', () => {
  for (const engine of WORKERS) {
    describe(engine, () => {
      const jobName = jobNameForMain(workerSource(engine))

      it('names the job after the file, not the folders above it', () => {
        expect(jobName('test/main.tex')).toBe('main')
        expect(jobName('papers/attention/main.tex')).toBe('main')
      })

      it('leaves a root-level document exactly as it was', () => {
        expect(jobName('main.tex')).toBe('main')
        expect(jobName('paper.tex')).toBe('paper')
      })

      it('strips whatever extension the driver was given', () => {
        // The XDV driver is handed `main.xdv`, not a `.tex`.
        expect(jobName('main.xdv')).toBe('main')
        expect(jobName('out/main.xdv')).toBe('main')
      })

      it('keeps dots inside the name', () => {
        expect(jobName('v2/paper.final.tex')).toBe('paper.final')
      })
    })
  }

  it('reads every output through the job name, never the input path', () => {
    // The bug was not the helper but the call sites, so pin those: a worker
    // that reads `self.mainfile` to build an output path has regressed.
    for (const engine of WORKERS) {
      const source = workerSource(engine)
      const outputReads = source
        .split('\n')
        .filter((line) => /\.(pdf|xdv|synctex|trace)\b/.test(line))
        .filter((line) => /self\.mainfile/.test(line))
        .filter((line) => !line.includes('jobNameForMain'))
      expect({ engine, outputReads }).toEqual({ engine, outputReads: [] })
    }
  })
})
