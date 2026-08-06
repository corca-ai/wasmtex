import { perf as e } from "../perf/metrics.js";
//#region src/engine/compile-scheduler.ts
function t(e, t, n) {
	return Math.min(n, Math.max(t, e));
}
var n = class {
	engine;
	onResult;
	onStatusChange;
	debounceTimer = null;
	compiling = !1;
	pendingCompile = !1;
	generation = 0;
	lastCompileTime = 0;
	minDebounceMs;
	maxDebounceMs;
	readyRetryMs = 50;
	readyRetries = 0;
	maxReadyRetries = 40;
	constructor(e, t, n, { minDebounceMs: r = 150, maxDebounceMs: i = 1e3 } = {}) {
		this.engine = e, this.onResult = t, this.onStatusChange = n, this.minDebounceMs = r, this.maxDebounceMs = i;
	}
	get debounceMs() {
		return this.lastCompileTime === 0 ? this.minDebounceMs : t(this.lastCompileTime * .5, this.minDebounceMs, this.maxDebounceMs);
	}
	schedule() {
		this.generation++, this.readyRetries = 0, this.debounceTimer && clearTimeout(this.debounceTimer), this.debounceTimer = setTimeout(() => {
			this.debounceTimer = null, e.end("debounce"), e.mark("compile"), this.runCompile();
		}, this.debounceMs);
	}
	armReadyRetry() {
		this.debounceTimer ||= setTimeout(() => {
			this.debounceTimer = null, this.runCompile();
		}, this.readyRetryMs);
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
					errors: [{
						line: 0,
						message: "Compile aborted: engine not ready",
						severity: "error"
					}],
					compileTime: 0,
					synctex: null
				});
				return;
			}
			this.readyRetries++, this.armReadyRetry();
			return;
		}
		this.readyRetries = 0, this.compiling = !0;
		let e = this.generation;
		this.onStatusChange("compiling");
		try {
			let t = await this.engine.compile();
			this.lastCompileTime = t.compileTime, e === this.generation && this.onResult(t);
		} catch (t) {
			t instanceof Error && t.name === "AbortError" || (console.error("Compilation error:", t), e === this.generation && this.onResult({
				success: !1,
				pdf: null,
				log: String(t),
				errors: [{
					line: 0,
					message: String(t),
					severity: "error"
				}],
				compileTime: 0,
				synctex: null
			}));
		} finally {
			this.compiling = !1, this.pendingCompile && (this.pendingCompile = !1, this.runCompile());
		}
	}
	flush() {
		this.debounceTimer && (clearTimeout(this.debounceTimer), this.debounceTimer = null, e.end("debounce"), e.mark("compile"), this.runCompile());
	}
	cancel() {
		this.debounceTimer &&= (clearTimeout(this.debounceTimer), null), this.pendingCompile = !1;
	}
	getDebounceMs() {
		return this.debounceMs;
	}
};
//#endregion
export { n as CompileScheduler };
