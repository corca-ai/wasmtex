function h(n) {
  const e = new Error(n);
  return e.name = "AbortError", e;
}
class p {
  worker = null;
  status = "unloaded";
  enginePath;
  texliveUrl;
  /**
   * Waiters per response key, oldest first. Legacy cmd-keyed requests
   * (`cmd:writefile`, `cmd:compile`, …) share a non-unique key, so concurrent
   * in-flight requests must queue rather than overwrite one another's resolver.
   */
  pendingResponses = /* @__PURE__ */ new Map();
  onProgress;
  constructor(e, s) {
    this.enginePath = e, this.texliveUrl = s;
  }
  getStatus() {
    return this.status;
  }
  terminate() {
    this.worker && (this.worker.terminate(), this.worker = null, this.status = "unloaded", this.rejectAllPending("Engine disposed while a request was in flight"));
  }
  /** Send a message to the worker and wait for a response keyed by responseKey. */
  postMessageWithResponse(e, s, t) {
    return new Promise((r, l) => {
      const o = { resolve: r, reject: l }, i = this.pendingResponses.get(s);
      i ? i.push(o) : this.pendingResponses.set(s, [o]), t?.length ? this.worker.postMessage(e, t) : this.worker.postMessage(e);
    });
  }
  /**
   * Deliver a worker response to the oldest waiter registered under `key` (FIFO,
   * matching the single-threaded worker's reply order). Returns true if a waiter
   * was waiting.
   */
  deliverResponse(e, s) {
    const t = this.pendingResponses.get(e);
    if (!t || t.length === 0) return !1;
    const r = t.shift();
    return t.length === 0 && this.pendingResponses.delete(e), r.resolve(s), !0;
  }
  /** Reject every pending request (oldest-first) so awaiters settle instead of hanging.
   *  Pass a string to reject as an AbortError (graceful teardown, e.g. terminate()), or a
   *  concrete Error to surface a real failure (e.g. a worker crash). No-op when idle. */
  rejectAllPending(e) {
    if (this.pendingResponses.size === 0) return;
    const s = e instanceof Error ? e : h(e);
    for (const t of this.pendingResponses.values())
      for (const r of t) r.reject(s);
    this.pendingResponses.clear();
  }
  /** Handle a spontaneous worker error (WASM OOM / uncaught glue error) that fires AFTER
   *  init: mark the engine errored and settle every in-flight request — notably a pending
   *  `compile()` — with a real error so it rejects instead of hanging forever (which would
   *  wedge the scheduler with `compiling` stuck true). Returns the surfaced Error. */
  handleWorkerError(e) {
    const s = e instanceof Error ? e : new Error("Worker error");
    return this.status = "error", this.rejectAllPending(s), s;
  }
}
const u = "https://d1jectpaw0dlvl.cloudfront.net/";
function g(n, e = "2025") {
  return n ? n.endsWith("/") ? n : `${n}/` : `${u}${e}/`;
}
export {
  p as BaseWorkerEngine,
  g as resolveTexliveUrl
};
