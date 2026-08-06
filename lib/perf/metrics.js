//#region src/perf/metrics.ts
var e = class {
	marks = /* @__PURE__ */ new Map();
	timings = /* @__PURE__ */ new Map();
	listeners = [];
	mark(e) {
		this.marks.set(e, performance.now());
	}
	end(e) {
		let t = this.marks.get(e);
		if (t === void 0) return 0;
		let n = performance.now() - t;
		this.marks.delete(e), this.timings.set(e, n);
		let r = {
			name: e,
			ms: n
		};
		for (let e of [...this.listeners]) e(r);
		return n;
	}
	get(e) {
		return this.timings.get(e);
	}
	all() {
		return new Map(this.timings);
	}
	onSpan(e) {
		return this.listeners.push(e), () => {
			let t = this.listeners.indexOf(e);
			t !== -1 && this.listeners.splice(t, 1);
		};
	}
}, t = new e();
function n() {
	if (typeof window > "u" || !new URLSearchParams(window.location.search).has("perf") || document.getElementById("perf-overlay")) return;
	let e = document.createElement("div");
	e.id = "perf-overlay", e.style.cssText = [
		"position:fixed",
		"bottom:4px",
		"right:4px",
		"background:rgba(0,0,0,0.8)",
		"color:#0f0",
		"font:11px/1.4 monospace",
		"padding:6px 10px",
		"border-radius:4px",
		"z-index:9999",
		"pointer-events:none",
		"white-space:pre"
	].join(";"), document.body.appendChild(e);
	let n = [
		"debounce",
		"compile",
		"synctex-parse",
		"render",
		"total"
	], r = t.onSpan(() => {
		let r = [];
		for (let e of n) {
			let n = t.get(e);
			n !== void 0 && r.push(`${e.padEnd(14)} ${n.toFixed(1).padStart(7)}ms`);
		}
		e.textContent = r.join("\n");
	});
	return () => {
		r(), e.remove();
	};
}
//#endregion
export { e as PerfMetrics, n as initPerfOverlay, t as perf };
