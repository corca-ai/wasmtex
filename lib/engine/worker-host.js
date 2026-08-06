//#region src/engine/worker-host.ts
var e = (e) => new Worker(e);
function t(t) {
	let n = e;
	return e = t, () => {
		e === t && (e = n);
	};
}
function n(t) {
	return e(t);
}
//#endregion
export { n as createEngineWorker, t as setWorkerFactory };
