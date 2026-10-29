import { BIBER_STAGE as e, createJsonTextBackend as t } from "./backend-registry.js";
//#region src/engine/biber-backend.ts
function n(n) {
	return t({
		id: "biber",
		stage: e,
		version: n.version,
		endpoint: n.endpoint,
		fetchImpl: n.fetchImpl,
		cacheKey: n.cacheKey
	});
}
async function r(t, n) {
	let r = t?.resolve(e);
	return !r || r.location !== "server" ? null : r.run(n);
}
async function i(t, n, r) {
	r?.signal?.throwIfAborted();
	let i = t?.resolve(e);
	return i ? i.run(n, r) : null;
}
//#endregion
export { e as BIBER_STAGE, n as createBiberBackend, i as runBiberBackend, r as runRemoteBiber };
