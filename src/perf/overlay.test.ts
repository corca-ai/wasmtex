import { afterEach, describe, expect, it } from 'vitest'
import { initPerfOverlay, perf } from './metrics'

/** Minimal DOM stub so the overlay's createElement/appendChild/getElementById/remove work in
 *  the plain-node vitest env (no jsdom). Tracks appended elements + an id index. */
function installDom(search = '?perf=1'): { overlays: () => number } {
  const elements: Array<{ id: string }> = []
  const byId = new Map<string, { id: string }>()
  const makeEl = () => {
    let id = ''
    const el = {
      style: { cssText: '' },
      textContent: '',
      get id() {
        return id
      },
      set id(v: string) {
        id = v
        byId.set(v, el)
      },
      remove() {
        const i = elements.indexOf(el)
        if (i !== -1) elements.splice(i, 1)
        if (id) byId.delete(id)
      },
    }
    return el
  }
  ;(globalThis as { document?: unknown }).document = {
    createElement: () => makeEl(),
    body: { appendChild: (el: { id: string }) => elements.push(el) },
    getElementById: (id: string) => byId.get(id) ?? null,
  }
  ;(globalThis as { window?: unknown }).window = { location: { search } }
  return { overlays: () => elements.filter((e) => e.id === 'perf-overlay').length }
}

const listenerCount = () => (perf as unknown as { listeners: unknown[] }).listeners.length

afterEach(() => {
  ;(globalThis as { document?: unknown }).document = undefined
  ;(globalThis as { window?: unknown }).window = undefined
})

describe('initPerfOverlay', () => {
  it('attaches at most one overlay and one listener across re-entry, and disposes both', () => {
    const dom = installDom('?perf=1')
    const before = listenerCount()

    const dispose = initPerfOverlay()
    const second = initPerfOverlay() // re-entry (e.g. a 2nd WasmTex instance) — guarded

    expect(dom.overlays()).toBe(1) // not 2 duplicate-id divs
    expect(listenerCount()).toBe(before + 1) // not a leaked listener per instance
    expect(second).toBeUndefined()

    dispose?.()
    expect(dom.overlays()).toBe(0) // overlay removed
    expect(listenerCount()).toBe(before) // listener unsubscribed
  })

  it('does nothing without ?perf=1', () => {
    const dom = installDom('')
    expect(initPerfOverlay()).toBeUndefined()
    expect(dom.overlays()).toBe(0)
  })
})
