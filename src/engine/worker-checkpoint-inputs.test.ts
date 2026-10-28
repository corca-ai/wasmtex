import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

// Execute authored checkpoint capture against observed filesystem reads. Memory/stream
// capture is independent of the dependency evidence tested here.
function capture(
  usedPreamble: boolean,
  preamble: string[] | null,
  body: string | null,
  consumed?: number,
) {
  let removed = false
  const scope = createContext({
    performance,
    importScripts() {},
    Asyncify: { currData: null },
    stackSave: () => 0,
    FS: {
      readFile() {
        if (body === null) throw Error('missing recorder')
        return body
      },
      unlink() {
        removed = true
      },
    },
  })
  scope.self = scope
  runInContext(
    readFileSync(new URL('../../wasm-build/pdftex-worker.js', import.meta.url), 'utf8'),
    scope,
  )
  scope.hcSparseImage = () => ({ bytes: 0 })
  scope.hcSnapshotFS = () => ({ files: {}, streams: [] })
  scope._hc = {
    transform: { usedPreamble },
    readInputs:
      body === null
        ? null
        : Object.fromEntries(
            body
              .trimEnd()
              .split('\n')
              .filter((line) => line.startsWith('INPUT '))
              .map((line) => [line.slice(6), true]),
          ),
  }
  if (consumed !== undefined) scope._hc.readExtents = { '/work/chapter.tex': consumed }
  scope._preambleInputFiles = preamble
  const snapshot = runInContext(
    'hcTakeSnapshot({id: "cp", path: "chapter.tex", line: 5, offset: 100})',
    scope,
  )
  expect(removed).toBe(false) // The live recorder must remain available to finalization.
  return snapshot
}

describe('checkpoint prefix dependency evidence', () => {
  it('includes cached preamble reads and deduplicates body reads', () => {
    const snapshot = capture(
      true,
      ['/work/config.tex', '/tex/article.cls'],
      'INPUT /work/main.tex\nINPUT /tex/article.cls\n',
    )
    expect(snapshot.inputs).toEqual(['/work/config.tex', '/tex/article.cls', '/work/main.tex'])
    expect(snapshot.inputsComplete).toBe(true)
  })
  it.each([
    [null, 'INPUT /work/main.tex\n'],
    [['/work/config.tex'], null],
  ])('refuses incomplete preamble/body evidence (%j, %j)', (preamble, body) => {
    const snapshot = capture(true, preamble, body)
    expect(snapshot.inputs).toBeNull()
    expect(snapshot.inputsComplete).toBe(false)
  })
  it('does not require a preamble recorder when no format was reused', () => {
    const snapshot = capture(false, null, 'INPUT /work/main.tex\nINPUT /work/config.tex\n')
    expect(snapshot.inputs).toEqual(['/work/main.tex', '/work/config.tex'])
    expect(snapshot.inputsComplete).toBe(true)
  })
})

it('refuses a secondary prefix when any stream or preamble already consumed its suffix', () => {
  expect(
    capture(false, null, 'INPUT /work/main.tex\nINPUT /work/chapter.tex\n', 100).prefixSafe,
  ).toBe(true)
  expect(
    capture(false, null, 'INPUT /work/main.tex\nINPUT /work/chapter.tex\n', 101).prefixSafe,
  ).toBe(false)
  expect(capture(true, ['/work/chapter.tex'], 'INPUT /work/main.tex\n', 0).prefixSafe).toBe(false)
  expect(capture(false, null, 'INPUT /work/main.tex\n').prefixSafe).toBe(false)
})
