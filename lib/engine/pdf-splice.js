class d extends Error {
  constructor() {
    super(
      'Incremental compile needs the optional peer dependency "pdf-lib" to splice head+tail PDFs. Install it (npm i pdf-lib) or disable incremental compilation.'
    ), this.name = "PdfLibUnavailableError";
  }
}
let o = null;
async function c() {
  return o || (o = import(
    /* @vite-ignore */
    "pdf-lib"
  ).catch(() => {
    throw o = null, new d();
  })), o;
}
async function p(n) {
  const t = n.filter((e) => e && e.length > 0);
  if (t.length === 0) throw new Error("splicePdfs: no PDF parts");
  if (t.length === 1) return t[0];
  const { PDFDocument: a } = await c(), r = await a.create();
  for (const e of t) {
    const i = await a.load(e, { ignoreEncryption: !0 }), s = await r.copyPages(i, i.getPageIndices());
    for (const l of s) r.addPage(l);
  }
  return r.save();
}
async function f(n) {
  const { PDFDocument: t } = await c();
  return (await t.load(n, { ignoreEncryption: !0 })).getPageCount();
}
export {
  d as PdfLibUnavailableError,
  f as pdfPageCount,
  p as splicePdfs
};
