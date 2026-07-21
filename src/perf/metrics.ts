/** Lightweight pipeline timing collector.
 *
 * Records named spans (mark → end) and exposes the last timing per span.
 * In debug mode (?perf=1) an overlay shows live timings.
 */

interface SpanTiming {
  name: string
  ms: number
}

type SpanListener = (span: SpanTiming) => void

export class PerfMetrics {
  private marks = new Map<string, number>()
  private timings = new Map<string, number>()
  private listeners: SpanListener[] = []

  /** Start a named span. */
  mark(name: string): void {
    this.marks.set(name, performance.now())
  }

  /** End a named span and record its duration. Returns ms elapsed. */
  end(name: string): number {
    const start = this.marks.get(name)
    if (start === undefined) return 0
    const ms = performance.now() - start
    this.marks.delete(name)
    this.timings.set(name, ms)
    const span = { name, ms }
    // Iterate a snapshot so a listener that unsubscribes itself (or an earlier-indexed
    // listener) during notification can't perturb the loop and skip the next listener.
    for (const fn of [...this.listeners]) fn(span)
    return ms
  }

  /** Get last recorded duration for a span. */
  get(name: string): number | undefined {
    return this.timings.get(name)
  }

  /** Get all recorded timings. */
  all(): Map<string, number> {
    return new Map(this.timings)
  }

  /** Subscribe to span completions. Returns an unsubscribe function (like
   *  {@link VirtualFS.onChange}) so a re-initialized overlay or embed doesn't leak a
   *  growing list of stale listeners. */
  onSpan(fn: SpanListener): () => void {
    this.listeners.push(fn)
    return () => {
      const i = this.listeners.indexOf(fn)
      if (i !== -1) this.listeners.splice(i, 1)
    }
  }
}

/** Singleton metrics instance. */
export const perf = new PerfMetrics()

/** Attach a debug overlay if ?perf=1 is in the URL. Returns a disposer that removes the
 *  overlay and unsubscribes its listener (call it from the owner's teardown), or undefined
 *  when no overlay was attached. */
export function initPerfOverlay(): (() => void) | undefined {
  if (typeof window === 'undefined') return
  if (!new URLSearchParams(window.location.search).has('perf')) return
  // Re-entry guard: two WasmTex instances on one page (a supported embed scenario) must not
  // stack duplicate-id overlays or leak a `perf.onSpan` listener per instance on the singleton.
  if (document.getElementById('perf-overlay')) return

  const overlay = document.createElement('div')
  overlay.id = 'perf-overlay'
  overlay.style.cssText = [
    'position:fixed',
    'bottom:4px',
    'right:4px',
    'background:rgba(0,0,0,0.8)',
    'color:#0f0',
    'font:11px/1.4 monospace',
    'padding:6px 10px',
    'border-radius:4px',
    'z-index:9999',
    'pointer-events:none',
    'white-space:pre',
  ].join(';')
  document.body.appendChild(overlay)

  const SPAN_ORDER = ['debounce', 'compile', 'synctex-parse', 'render', 'total']

  const off = perf.onSpan(() => {
    const lines: string[] = []
    for (const name of SPAN_ORDER) {
      const ms = perf.get(name)
      if (ms !== undefined) {
        lines.push(`${name.padEnd(14)} ${ms.toFixed(1).padStart(7)}ms`)
      }
    }
    overlay.textContent = lines.join('\n')
  })

  return () => {
    off()
    overlay.remove()
  }
}
