//#region src/engine/compiler-operation.ts
var e = class {
	active = null;
	get busy() {
		return this.active !== null;
	}
	cancel() {
		let e = this.active;
		return e?.controller.abort(new DOMException("Compiler input changed or compiler disposed", "AbortError")), e?.settled ?? Promise.resolve();
	}
	async run(e) {
		if (this.active) throw Error("Compiler operation already in progress");
		let t = new AbortController(), n = new Promise((e, n) => {
			t.signal.addEventListener("abort", () => n(t.signal.reason), { once: !0 });
		});
		n.catch(() => {});
		let r, i = {
			controller: t,
			cancelled: n,
			settled: new Promise((e) => {
				r = e;
			})
		};
		this.active = i;
		try {
			let n = await e();
			return t.signal.throwIfAborted(), n;
		} catch (e) {
			throw t.signal.throwIfAborted(), e;
		} finally {
			this.active === i && (this.active = null), r();
		}
	}
	assertCurrent() {
		this.active?.controller.signal.throwIfAborted();
	}
	async observe(e) {
		let t = this.active, n = await (t ? Promise.race([e, t.cancelled]) : e);
		return { resume: () => (t?.controller.signal.throwIfAborted(), n) };
	}
};
//#endregion
export { e as CompilerOperations };
