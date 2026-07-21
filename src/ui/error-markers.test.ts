import { describe, expect, it, vi } from 'vitest'

// The shared monaco mock omits MarkerSeverity (only the LSP/provider paths use it).
// errorToMarker reads monaco.MarkerSeverity, so supply a self-contained mock here that
// extends the default one with the severity enum it needs.
vi.mock('monaco-editor', async () => {
  const actual = await vi.importActual<typeof import('../__mocks__/monaco-editor')>(
    '../__mocks__/monaco-editor',
  )
  return { ...actual, MarkerSeverity: { Error: 8, Warning: 4, Info: 2 } }
})

import * as monaco from 'monaco-editor'
// @ts-expect-error test-only helper added to the vitest monaco mock
import { __resetMonacoModels } from 'monaco-editor'
import type { TexError } from '../types'
import { errorToMarker, setErrorMarkers } from './error-markers'
import { clampMarkerRange } from './marker-range'

// A 10-line model where every line has max column 20.
const stubModel = { getLineCount: () => 10, getLineMaxColumn: () => 20 }

describe('errorToMarker', () => {
  it('propagates TexError.code (machine-readable classification) onto the marker', () => {
    const err: TexError = {
      file: 'main.tex',
      line: 3,
      message: "File `foo.sty' not found — install the package",
      severity: 'error',
      code: 'missing-package',
    }
    const marker = errorToMarker(err, stubModel)
    expect(marker.code).toBe('missing-package')
  })

  it('leaves marker.code undefined when the error has no code', () => {
    const err: TexError = {
      file: 'main.tex',
      line: 1,
      message: 'Undefined control sequence',
      severity: 'error',
    }
    const marker = errorToMarker(err, stubModel)
    expect(marker.code).toBeUndefined()
  })
})

describe('clampMarkerRange', () => {
  // A 3-char single line ("abc"): 1 line, max column 4 (Monaco columns are 1-based and the
  // max column is one past the last char).
  const oneLine = (_line: number) => 4

  it('keeps a valid in-bounds range unchanged', () => {
    expect(clampMarkerRange(1, 2, 4, 1, oneLine)).toEqual({
      startLineNumber: 1,
      startColumn: 2,
      endLineNumber: 1,
      endColumn: 4,
    })
  })

  it('never produces an inverted range when a stale diagnostic points past the line', () => {
    // Stale diagnostic at line 50, columns 30..40 against a now 1-line/4-column model.
    const r = clampMarkerRange(50, 30, 40, 1, oneLine)
    expect(r.startLineNumber).toBe(1)
    expect(r.endLineNumber).toBe(1)
    expect(r.startColumn).toBeLessThanOrEqual(r.endColumn)
    expect(r.startColumn).toBe(4)
    expect(r.endColumn).toBe(4)
  })

  it('clamps the start column up to 1 and the end column down to the line max', () => {
    const r = clampMarkerRange(1, 0, 999, 1, oneLine)
    expect(r.startColumn).toBe(1)
    expect(r.endColumn).toBe(4)
  })

  it('clamps the line into [1, lineCount]', () => {
    expect(clampMarkerRange(0, 1, 2, 5, () => 10).startLineNumber).toBe(1)
    expect(clampMarkerRange(99, 1, 2, 5, () => 10).startLineNumber).toBe(5)
  })

  it('keeps end >= start even when the requested end precedes the start', () => {
    const r = clampMarkerRange(1, 8, 2, 1, (_l) => 20)
    expect(r.startColumn).toBe(8)
    expect(r.endColumn).toBeGreaterThanOrEqual(r.startColumn)
  })
})

describe('setErrorMarkers instance scoping', () => {
  it('does not clear a sibling instance’s markers for files it does not own', () => {
    __resetMonacoModels()
    // Two WasmTex instances on one page: A owns main.tex, B owns other.tex.
    const aModel = monaco.editor.createModel('l1\nbad\nl3', 'latex', monaco.Uri.file('/main.tex'))
    const bModel = monaco.editor.createModel('hello', 'latex', monaco.Uri.file('/other.tex'))

    // A's compile reports an error on main.tex → A's model gets a 'tex' marker.
    const err: TexError = { file: 'main.tex', line: 2, message: 'oops', severity: 'error' }
    setErrorMarkers([err], [aModel])
    expect(monaco.editor.getModelMarkers({ owner: 'tex', resource: aModel.uri })).toHaveLength(1)

    // B compiles cleanly (zero errors): scoped to B's own models, it must NOT iterate A's.
    setErrorMarkers([], [bModel])

    // A's marker survives — the old global getModels() iteration cleared it cross-instance.
    expect(monaco.editor.getModelMarkers({ owner: 'tex', resource: aModel.uri })).toHaveLength(1)
  })
})
