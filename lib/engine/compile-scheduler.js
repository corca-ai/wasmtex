import { perf as t } from "../perf/metrics.js";
function l(n, i, e) {
  return Math.min(e, Math.max(i, n));
}
class u {
  constructor(i, e, s, { minDebounceMs: r = 150, maxDebounceMs: o = 1e3 } = {}) {
    this.engine = i, this.onResult = e, this.onStatusChange = s, this.minDebounceMs = r, this.maxDebounceMs = o;
  }
  debounceTimer = null;
  compiling = !1;
  pendingCompile = !1;
  generation = 0;
  lastCompileTime = 0;
  minDebounceMs;
  maxDebounceMs;
  /** Poll interval for retrying a compile blocked on engine readiness. */
  readyRetryMs = 50;
  /** Consecutive ready-retries already spent on the current pending compile. */
  readyRetries = 0;
  /** Cap on ready-retries (~2s at 50ms) before giving up and surfacing a failure, so a
   *  permanently-not-ready engine isn't polled forever with the compile silently dropped. */
  maxReadyRetries = 40;
  get debounceMs() {
    return this.lastCompileTime === 0 ? this.minDebounceMs : l(this.lastCompileTime * 0.5, this.minDebounceMs, this.maxDebounceMs);
  }
  schedule() {
    this.generation++, this.readyRetries = 0, this.debounceTimer && clearTimeout(this.debounceTimer), this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null, t.end("debounce"), t.mark("compile"), this.runCompile();
    }, this.debounceMs);
  }
  /** Re-arm the debounce timer to retry a compile once the engine becomes ready. */
  armReadyRetry() {
    this.debounceTimer || (this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null, this.runCompile();
    }, this.readyRetryMs));
  }
  async runCompile() {
    if (this.compiling) {
      this.pendingCompile = !0;
      return;
    }
    if (!this.engine.isReady()) {
      if (this.readyRetries >= this.maxReadyRetries) {
        this.readyRetries = 0, this.onStatusChange("error", "Engine not ready"), this.onResult({
          success: !1,
          pdf: null,
          log: "Engine not ready",
          errors: [{ line: 0, message: "Compile aborted: engine not ready", severity: "error" }],
          compileTime: 0,
          synctex: null
        });
        return;
      }
      this.readyRetries++, this.armReadyRetry();
      return;
    }
    this.readyRetries = 0, this.compiling = !0;
    const i = this.generation;
    this.onStatusChange("compiling");
    try {
      const e = await this.engine.compile();
      this.lastCompileTime = e.compileTime, i === this.generation && this.onResult(e);
    } catch (e) {
      e instanceof Error && e.name === "AbortError" || (console.error("Compilation error:", e), i === this.generation && this.onResult({
        success: !1,
        pdf: null,
        log: String(e),
        errors: [{ line: 0, message: String(e), severity: "error" }],
        compileTime: 0,
        synctex: null
      }));
    } finally {
      this.compiling = !1, this.pendingCompile && (this.pendingCompile = !1, this.runCompile());
    }
  }
  /** Immediately fire the pending debounce timer (skip remaining wait). */
  flush() {
    this.debounceTimer && (clearTimeout(this.debounceTimer), this.debounceTimer = null, t.end("debounce"), t.mark("compile"), this.runCompile());
  }
  cancel() {
    this.debounceTimer && (clearTimeout(this.debounceTimer), this.debounceTimer = null), this.pendingCompile = !1;
  }
  getDebounceMs() {
    return this.debounceMs;
  }
}
export {
  u as CompileScheduler
};
