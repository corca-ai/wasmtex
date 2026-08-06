//#region src/engine/persist-watermark.ts
async function e(e, t) {
	if (e.inFlight || e.downloadCount === e.lastPersisted) return;
	let n = e.downloadCount;
	e.inFlight = !0;
	try {
		await t(), e.lastPersisted = n;
	} catch {} finally {
		e.inFlight = !1;
	}
}
//#endregion
export { e as persistIfNeeded };
