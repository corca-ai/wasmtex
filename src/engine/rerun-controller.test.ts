import { describe, expect, it } from 'vitest'
import { needsRerun, RerunController, signatureOf } from './rerun-controller'

const RERUN_LOG = 'LaTeX Warning: Label(s) may have changed. Rerun to get cross-references right.\n'
const CLEAN_LOG = 'Output written to main.pdf (1 page).\n'

describe('needsRerun', () => {
  it('detects rerun requests', () => {
    expect(needsRerun(RERUN_LOG)).toBe(true)
    expect(needsRerun('Please (re)run Biber')).toBe(true)
    expect(needsRerun('Rerun to get outlines right')).toBe(true)
    expect(needsRerun(CLEAN_LOG)).toBe(false)
  })
})

describe('RerunController', () => {
  it('settles biblatex after the first pass that reads the generated BBL', () => {
    const controller = new RerunController()
    const biber = 'Package biblatex Warning: Please (re)run Biber on the file: main.'
    const latex =
      'Package biblatex Warning: Please rerun LaTeX.\n(biblatex) Page breaks have changed.'
    expect(controller.decide(biber, 'before-bbl', true)).toEqual({ rerun: true })
    expect(controller.decide(latex, 'bbl-loaded')).toEqual({ rerun: true })
    expect(controller.decide(CLEAN_LOG, 'bbl-loaded')).toEqual({ rerun: false })
    expect(needsRerun(latex)).toBe(true)
  })

  it('does not rerun a converged compile', () => {
    expect(new RerunController().decide(CLEAN_LOG, 'sig').rerun).toBe(false)
  })

  it('reruns while references keep changing, then stops when clean', () => {
    const c = new RerunController()
    expect(c.decide(RERUN_LOG, 'a').rerun).toBe(true) // pass 1 changed refs
    expect(c.decide(RERUN_LOG, 'b').rerun).toBe(true) // pass 2 changed again
    expect(c.decide(CLEAN_LOG, 'b').rerun).toBe(false) // converged
  })

  it('terminates on an oscillating document at the rerun limit', () => {
    const c = new RerunController(3)
    // The signature flips every pass (A↔B) and the log always asks for a rerun.
    let decision = c.decide(RERUN_LOG, 'A')
    let count = 0
    const sigs = ['B', 'A', 'B', 'A', 'B', 'A', 'B']
    while (decision.rerun) {
      decision = c.decide(RERUN_LOG, sigs[count++]!)
      expect(count).toBeLessThan(10) // provably terminates
    }
    expect(decision.stopped).toBe('limit')
  })

  it('stops early when a rerun makes no progress (stuck refs)', () => {
    const c = new RerunController()
    expect(c.decide(RERUN_LOG, 'same').rerun).toBe(true)
    const decision = c.decide(RERUN_LOG, 'same') // identical signature → no progress
    expect(decision).toEqual({ rerun: false, stopped: 'no-progress' })
  })

  it('a converged pass does not block a later genuine rerun with the same signature', () => {
    // A clean (non-rerun) pass must not seed the no-progress baseline: if the controller is
    // reused and the next pass legitimately asks for a rerun while the cross-ref signature
    // happens to equal the converged one, that rerun must still happen (count is still 0).
    const c = new RerunController()
    expect(c.decide(CLEAN_LOG, 'X').rerun).toBe(false)
    expect(c.decide(RERUN_LOG, 'X').rerun).toBe(true)
  })

  it('resets between edits', () => {
    const c = new RerunController(1)
    expect(c.decide(RERUN_LOG, 'a').rerun).toBe(true)
    expect(c.decide(RERUN_LOG, 'b').stopped).toBe('limit')
    c.reset()
    expect(c.decide(RERUN_LOG, 'c').rerun).toBe(true)
  })

  it('bounds auxiliary-only reruns even when TeX emits no rerun warning', () => {
    const c = new RerunController(2)
    expect(c.decide(CLEAN_LOG, 'same', true).rerun).toBe(true)
    expect(c.decide(CLEAN_LOG, 'same', true).rerun).toBe(true)
    expect(c.decide(CLEAN_LOG, 'same', true)).toEqual({ rerun: false, stopped: 'limit' })
    expect(c.decide(CLEAN_LOG, 'same', false)).toEqual({ rerun: false })
  })
})

describe('signatureOf', () => {
  it('is stable and distinguishes content', () => {
    expect(signatureOf('x')).toBe(signatureOf('x'))
    expect(signatureOf('x')).not.toBe(signatureOf('y'))
    expect(signatureOf(undefined)).toBe(signatureOf(''))
  })
})
