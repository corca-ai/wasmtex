/** One main-engine operation, including all of its asynchronous continuations. */
export class CompilerOperations {
  private active: {
    controller: AbortController
    cancelled: Promise<never>
    settled: Promise<void>
  } | null = null

  get busy(): boolean {
    return this.active !== null
  }

  cancel(): Promise<void> {
    const active = this.active
    active?.controller.abort(
      new DOMException('Compiler input changed or compiler disposed', 'AbortError'),
    )
    return active?.settled ?? Promise.resolve()
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.active) throw new Error('Compiler operation already in progress')
    const controller = new AbortController()
    const cancelled = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(controller.signal.reason), {
        once: true,
      })
    })
    // Cancellation can happen synchronously in a host callback, before the first await.
    void cancelled.catch(() => {})
    let finish!: () => void
    const settled = new Promise<void>((resolve) => {
      finish = resolve
    })
    const active = { controller, cancelled, settled }
    this.active = active
    try {
      const value = await work()
      controller.signal.throwIfAborted()
      return value
    } catch (error) {
      controller.signal.throwIfAborted()
      throw error
    } finally {
      if (this.active === active) this.active = null
      finish()
    }
  }

  assertCurrent(): void {
    this.active?.controller.signal.throwIfAborted()
  }

  // Check at the caller's continuation, not merely inside the await helper:
  // a host edit can occur between promise resolution and that continuation.
  async observe<T>(promise: PromiseLike<T> | T): Promise<{ resume(): T }> {
    const active = this.active
    const value = await (active ? Promise.race([promise, active.cancelled]) : promise)
    return {
      resume: () => {
        active?.controller.signal.throwIfAborted()
        return value
      },
    }
  }
}
