import { INDEX_STAGE as e, createJsonTextBackend as t } from "./backend-registry.js";
import { stripTexComments as n } from "./tex-comments.js";
//#region src/engine/index-backend.ts
function r(e) {
	let t = n(e);
	return /\\makeindex\b/.test(t) && /\\printindex\b/.test(t);
}
async function i(t, n) {
	let r = t?.resolve(e);
	return !r || r.location !== "server" ? null : r.run(n);
}
function a(n) {
	return t({
		id: "makeindex",
		stage: e,
		version: n.version,
		endpoint: n.endpoint,
		fetchImpl: n.fetchImpl,
		cacheKey: n.cacheKey
	});
}
//#endregion
export { e as INDEX_STAGE, a as createMakeindexBackend, r as detectIndexUse, i as runRemoteIndex };
