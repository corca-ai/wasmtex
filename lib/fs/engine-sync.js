//#region src/fs/engine-sync.ts
async function e(e, t, n, r) {
	let i = e.listFiles();
	await n(i);
	let a = [];
	for (let n of i) {
		let r = e.getFile(n);
		r && (await t.writeFile(n, r.content), a.push(r));
	}
	e.markSynced(a), t.setMainFile(r);
}
//#endregion
export { e as syncAllFilesToEngine };
