import { INDEX_STAGE as e, createJsonTextBackend as t } from "./backend-registry.js";
//#region src/engine/xindy-backend.ts
function n(n) {
	return t({
		id: "xindy",
		stage: e,
		version: n.version,
		endpoint: n.endpoint,
		fetchImpl: n.fetchImpl,
		cacheKey: n.cacheKey
	});
}
//#endregion
export { n as createXindyBackend };
