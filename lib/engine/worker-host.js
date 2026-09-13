//#region src/engine/worker-host.ts
var e = (e) => new Worker(e), t = [];
function n(e) {
	let n = { factory: e };
	return t.push(n), () => {
		let e = t.indexOf(n);
		e !== -1 && t.splice(e, 1);
	};
}
function r(n) {
	return (t.at(-1)?.factory ?? e)(n);
}
//#endregion
export { r as createEngineWorker, n as setWorkerFactory };
