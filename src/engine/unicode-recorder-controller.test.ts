import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const xetexEntry = readFileSync(new URL('../../wasm-build/xetex-entry.c', import.meta.url), 'utf8')
const luatexEntry = readFileSync(
  new URL('../../wasm-build/luatex-entry.c', import.meta.url),
  'utf8',
)
const xetexWorker = readFileSync(
  new URL('../../wasm-build/xetex-worker.js', import.meta.url),
  'utf8',
)
const luatexWorker = readFileSync(
  new URL('../../wasm-build/luatex-worker.js', import.meta.url),
  'utf8',
)

describe('Unicode engine recorder controllers', () => {
  it.each([
    ['XeTeX', xetexEntry, xetexWorker],
    ['LuaHBTeX', luatexEntry, luatexWorker],
  ])('%s enables recorder and returns its unfiltered INPUT list', (_name, entry, worker) => {
    expect(entry).toContain('"-recorder"')
    expect(worker).toContain('function readRecorderInputs(jobName)')
    expect(worker).toContain(".filter((line) => line.startsWith('INPUT '))")
    expect(worker).not.toContain("filter((path) => path.endsWith('.tex'))")
    expect(worker).toContain(
      'inputFilesComplete: recorderJobName ? inputFiles !== null : undefined',
    )
  })
})
