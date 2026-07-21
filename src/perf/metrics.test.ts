import { describe, expect, it, vi } from 'vitest'
import { PerfMetrics } from './metrics'

describe('PerfMetrics', () => {
  it('records a span duration between mark and end', () => {
    const perf = new PerfMetrics()
    perf.mark('compile')
    const ms = perf.end('compile')
    expect(ms).toBeGreaterThanOrEqual(0)
    expect(perf.get('compile')).toBe(ms)
  })

  it('end() on an unstarted span returns 0 and records nothing', () => {
    const perf = new PerfMetrics()
    expect(perf.end('never-started')).toBe(0)
    expect(perf.get('never-started')).toBeUndefined()
  })

  it('all() returns a copy that does not mutate internal state', () => {
    const perf = new PerfMetrics()
    perf.mark('x')
    perf.end('x')
    const snapshot = perf.all()
    snapshot.set('x', 999)
    expect(perf.get('x')).not.toBe(999)
  })

  it('notifies span listeners on end', () => {
    const perf = new PerfMetrics()
    const seen = vi.fn()
    perf.onSpan(seen)
    perf.mark('render')
    perf.end('render')
    expect(seen).toHaveBeenCalledOnce()
    expect(seen.mock.calls[0]![0]!.name).toBe('render')
  })

  it('onSpan returns a working unsubscribe (no leak on re-subscribe)', () => {
    const perf = new PerfMetrics()
    const seen = vi.fn()
    const off = perf.onSpan(seen)
    off()
    perf.mark('render')
    perf.end('render')
    expect(seen).not.toHaveBeenCalled()
  })

  it('notifies all listeners even if one unsubscribes during end()', () => {
    const perf = new PerfMetrics()
    const order: string[] = []
    // self-unsubscribing first listener must not cause the second to be skipped
    const off1 = perf.onSpan(() => {
      order.push('l1')
      off1()
    })
    perf.onSpan(() => {
      order.push('l2')
    })
    perf.mark('x')
    perf.end('x')
    expect(order).toEqual(['l1', 'l2'])
  })

  it('does not skip a later listener when an earlier one is removed mid-notify', () => {
    const perf = new PerfMetrics()
    const order: string[] = []
    const off1 = perf.onSpan(() => {
      order.push('l1')
    })
    perf.onSpan(() => {
      order.push('l2')
      off1() // removes an earlier-indexed listener mid-iteration
    })
    perf.onSpan(() => {
      order.push('l3')
    })
    perf.mark('x')
    perf.end('x')
    expect(order).toEqual(['l1', 'l2', 'l3'])
  })
})
