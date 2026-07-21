import * as monaco from 'monaco-editor'
// @ts-expect-error test-only helper added to the vitest monaco mock
import { __resetMonacoModels } from 'monaco-editor'
import { afterEach, describe, expect, it } from 'vitest'
import { createFileModel } from './setup'

describe('createFileModel', () => {
  afterEach(() => {
    // The mock's model registry is global per URI; clear it so tests stay isolated.
    __resetMonacoModels()
  })

  it('does not throw when the same path is opened twice (e.g. a second instance)', () => {
    const first = createFileModel('A', '/main.tex')
    // A second WasmTex instance (empty per-instance map) re-creates the same URI.
    expect(() => createFileModel('B', '/main.tex')).not.toThrow()
    const second = createFileModel('B', '/main.tex')
    expect(second).toBe(first) // reuse the existing model, don't register a duplicate
    expect(monaco.editor.getModel(monaco.Uri.file('/main.tex'))).toBe(first)
  })

  it('updates the reused model content when it differs', () => {
    const m = createFileModel('A', '/main.tex')
    const again = createFileModel('B', '/main.tex')
    expect(again).toBe(m)
    expect(m.getValue()).toBe('B')
  })

  it('normalizes a bare path to a leading-slash file URI', () => {
    const m = createFileModel('x', 'notes.tex')
    expect(monaco.editor.getModel(monaco.Uri.file('/notes.tex'))).toBe(m)
  })

  it('does not overwrite a reused model when overwriteOnReuse is false (collaboration)', () => {
    const first = createFileModel('A', '/main.tex')
    const reused = createFileModel('B', '/main.tex', false)
    expect(reused).toBe(first)
    expect(first.getValue()).toBe('A') // CRDT-authoritative content preserved
  })
})
