//#region src/engine/pdf-splice.ts
var e = class extends Error {
	constructor() {
		super("Incremental compile needs the optional peer dependency \"pdf-lib\" to splice head+tail PDFs. Install it (npm i pdf-lib) or disable incremental compilation."), this.name = "PdfLibUnavailableError";
	}
}, t = null;
async function n() {
	return t ||= import(
		/* @vite-ignore */
		"pdf-lib"
).catch(() => {
		throw t = null, new e();
	}), t;
}
async function r(e) {
	let t = e.filter((e) => e && e.length > 0);
	if (t.length === 0) throw Error("splicePdfs: no PDF parts");
	if (t.length === 1) return t[0];
	let { PDFDocument: r } = await n(), i = await r.create();
	for (let e of t) {
		let t = await r.load(e, { ignoreEncryption: !0 }), n = await i.copyPages(t, t.getPageIndices());
		for (let e of n) i.addPage(e);
	}
	return i.save();
}
async function i(e) {
	let { PDFDocument: t } = await n();
	return (await t.load(e, { ignoreEncryption: !0 })).getPageCount();
}
//#endregion
export { e as PdfLibUnavailableError, i as pdfPageCount, r as splicePdfs };
