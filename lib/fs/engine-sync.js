//#region src/fs/engine-sync.ts
async function e(e, t, n, r) {
	let i = e.listFiles();
	await n(i);
	let a = i.flatMap((t) => {
		let n = e.getFile(t);
		return n ? [n] : [];
	});
	await Promise.all(a.map((e) => t.writeFile(e.path, e.content))), e.markSynced(a), t.setMainFile(r);
}
//#endregion
export { e as syncAllFilesToEngine };
