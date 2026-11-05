//#region src/engine/asset-response.ts
function e(e) {
	return e.status === 200 && !/text\/html/i.test(e.headers.get("content-type") ?? "");
}
//#endregion
export { e as isAssetResponse };
