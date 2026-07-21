import { describe, expect, it } from 'vitest'
import { RenderGate } from './render-gate'

/** Minimal stand-in for a pdf.js PDFDocumentProxy: records whether destroy() was called. */
function fakeDoc(): { destroy(): void; destroyed: boolean } {
  return {
    destroyed: false,
    destroy() {
      this.destroyed = true
    },
  }
}

describe('RenderGate', () => {
  it('claim returns the doc — and never destroys it — while the token is current', () => {
    const gate = new RenderGate()
    const token = gate.begin()
    const doc = fakeDoc()
    expect(gate.claim(doc, token)).toBe(doc)
    expect(doc.destroyed).toBe(false)
  })

  it('a superseded render destroys ITS OWN loaded doc and bails (use-after-destroy fix)', () => {
    const gate = new RenderGate()
    const stale = gate.begin() // render A starts
    gate.begin() // render B supersedes A while A is still loading
    const docA = fakeDoc()
    // A finished loading late: it must NOT become current, and must destroy its own doc.
    expect(gate.claim(docA, stale)).toBeNull()
    expect(docA.destroyed).toBe(true)
  })

  it('the live (current) doc is never the one a stale claim destroys', () => {
    const gate = new RenderGate()
    const a = gate.begin()
    const b = gate.begin()
    const docB = fakeDoc() // B is current and claims successfully
    expect(gate.claim(docB, b)).toBe(docB)
    const docA = fakeDoc() // A (stale) resolves afterward
    expect(gate.claim(docA, a)).toBeNull()
    expect(docB.destroyed).toBe(false) // current doc untouched
    expect(docA.destroyed).toBe(true) // only the stale doc is destroyed
  })

  it('isCurrent gates loop iterations: a superseded loop stops (textMapper-corruption fix)', () => {
    const gate = new RenderGate()
    const token = gate.begin()
    expect(gate.isCurrent(token)).toBe(true) // loop runs
    gate.begin() // a newer render starts mid-loop
    expect(gate.isCurrent(token)).toBe(false) // next iteration's guard breaks the stale loop
  })

  it('only the latest token is current; every earlier token is superseded', () => {
    const gate = new RenderGate()
    const a = gate.begin()
    const b = gate.begin()
    const c = gate.begin()
    expect(gate.isCurrent(a)).toBe(false)
    expect(gate.isCurrent(b)).toBe(false)
    expect(gate.isCurrent(c)).toBe(true)
  })
})
