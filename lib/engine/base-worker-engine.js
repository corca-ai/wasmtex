function l(r) {
  const e = new Error(r);
  return e.name = "AbortError", e;
}
function o(r) {
  return typeof r == "string" && r ? r : null;
}
function f(r) {
  if (typeof r != "object" || r === null) return null;
  const e = r, n = o(e.message);
  if (!n) return null;
  const t = new Error(n), s = o(e.name);
  s && (t.name = s);
  const i = o(e.stack);
  return i && (t.stack = i), t;
}
function g(r) {
  const e = o(r.filename);
  if (!e) return "";
  const n = [e];
  return typeof r.lineno == "number" && (n.push(String(r.lineno)), typeof r.colno == "number" && n.push(String(r.colno))), ` (${n.join(":")})`;
}
function p(r) {
  if (r instanceof Error) return r;
  if (typeof r != "object" || r === null) return new Error("Worker error");
  const e = r;
  if (e.error instanceof Error) return e.error;
  const n = f(e.error);
  if (n) return n;
  const t = o(e.message) ?? "Worker error";
  return new Error(`${t}${g(e)}`);
}
class a {
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
  constructor(e, n) {
    this.enginePath = e, this.texliveUrl = n;
  }
  getStatus() {
    return this.status;
  }
  terminate() {
    this.worker && (this.worker.terminate(), this.worker = null, this.status = "unloaded", this.rejectAllPending("Engine disposed while a request was in flight"));
  }
  /** Send a message to the worker and wait for a response keyed by responseKey. */
  postMessageWithResponse(e, n, t) {
    return new Promise((s, i) => {
      const u = { resolve: s, reject: i }, c = this.pendingResponses.get(n);
      c ? c.push(u) : this.pendingResponses.set(n, [u]), t?.length ? this.worker.postMessage(e, t) : this.worker.postMessage(e);
    });
  }
  /**
   * Deliver a worker response to the oldest waiter registered under `key` (FIFO,
   * matching the single-threaded worker's reply order). Returns true if a waiter
   * was waiting.
   */
  deliverResponse(e, n) {
    const t = this.pendingResponses.get(e);
    if (!t || t.length === 0) return !1;
    const s = t.shift();
    return t.length === 0 && this.pendingResponses.delete(e), s.resolve(n), !0;
  }
  /** Reject every pending request (oldest-first) so awaiters settle instead of hanging.
   *  Pass a string to reject as an AbortError (graceful teardown, e.g. terminate()), or a
   *  concrete Error to surface a real failure (e.g. a worker crash). No-op when idle. */
  rejectAllPending(e) {
    if (this.pendingResponses.size === 0) return;
    const n = e instanceof Error ? e : l(e);
    for (const t of this.pendingResponses.values())
      for (const s of t) s.reject(n);
    this.pendingResponses.clear();
  }
  /** Handle a spontaneous worker error (WASM OOM / uncaught glue error) that fires AFTER
   *  init: mark the engine errored and settle every in-flight request — notably a pending
   *  `compile()` — with a real error so it rejects instead of hanging forever (which would
   *  wedge the scheduler with `compiling` stuck true). Returns the surfaced Error. */
  handleWorkerError(e) {
    const n = p(e);
    return this.status = "error", this.rejectAllPending(n), n;
  }
}
const h = "https://d1jectpaw0dlvl.cloudfront.net/";
function d(r, e = "2025") {
  return r ? r.endsWith("/") ? r : `${r}/` : `${h}${e}/`;
}
export {
  a as BaseWorkerEngine,
  d as resolveTexliveUrl
};
