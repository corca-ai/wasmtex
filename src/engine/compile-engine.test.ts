import { describe, expect, it } from 'vitest'
import { classifyCompile } from '../compat/classify'
import {
  createCompileEngine,
  engineBinaryFor,
  engineDisplayName,
  unavailableEngineResult,
} from './compile-engine'
import { WasmTexLuatexEngine } from './luatex-engine'
import { WasmTexPdftexEngine } from './wasmtex-engine'
import { WasmTexXetexEngine } from './xetex-engine'

describe('engine factory', () => {
  it('maps pdflatex to the pdfTeX engine', () => {
    expect(createCompileEngine('pdflatex')).toBeInstanceOf(WasmTexPdftexEngine)
  })

  it('maps xelatex to the two-worker XeTeX orchestration', () => {
    expect(createCompileEngine('xelatex')).toBeInstanceOf(WasmTexXetexEngine)
  })

  it('maps lualatex to the single-worker LuaTeX engine', () => {
    expect(createCompileEngine('lualatex')).toBeInstanceOf(WasmTexLuatexEngine)
  })

  it('starts the Unicode engines unloaded (no worker until init)', () => {
    expect(createCompileEngine('xelatex').getStatus()).toBe('unloaded')
    expect(createCompileEngine('lualatex').getStatus()).toBe('unloaded')
  })

  it('maps engines to their WASM binary basenames', () => {
    expect(engineBinaryFor('pdflatex')).toBe('pdftex')
    expect(engineBinaryFor('xelatex')).toBe('xetex')
    expect(engineBinaryFor('lualatex')).toBe('luatex')
  })

  it('has human-facing display names', () => {
    expect(engineDisplayName('xelatex')).toBe('XeLaTeX')
    expect(engineDisplayName('lualatex')).toBe('LuaLaTeX')
    expect(engineDisplayName('pdflatex')).toBe('pdfLaTeX')
  })
})

describe('unavailableEngineResult', () => {
  const detection = { engine: 'xelatex' as const, reason: 'package "xeCJK"', forced: false }

  it('is a failed result naming the required engine', () => {
    const r = unavailableEngineResult(detection)
    expect(r.success).toBe(false)
    expect(r.pdf).toBeNull()
    expect(r.log).toMatch(/requires XeLaTeX/)
    expect(r.errors[0]?.message).toMatch(/XeLaTeX/)
  })

  it('produces a log the compatibility classifier buckets as needs-xelatex-lualatex', () => {
    // Contract: the actionable message must stay machine-classifiable.
    const r = unavailableEngineResult(detection)
    const cls = classifyCompile({ success: false, hasPdf: false, log: r.log })
    expect(cls.class).toBe('needs-xelatex-lualatex')
  })

  it('includes the underlying cause when given one', () => {
    const r = unavailableEngineResult(detection, new Error('worker 404'))
    expect(r.log).toContain('worker 404')
  })
})
