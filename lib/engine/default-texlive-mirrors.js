//#region src/engine/default-texlive-mirrors.ts
var e = {
	2025: "https://texlive.corca.ai/snapshots/2025-92e10d3241a312f0/2025/",
	2026: "https://texlive.corca.ai/snapshots/2026-ba38749b8714505a/2026/"
};
function t(t) {
	return e[t];
}
//#endregion
export { t as defaultTexliveUrl };
