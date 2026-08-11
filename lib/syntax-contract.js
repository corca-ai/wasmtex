//#region src/syntax-contract.ts
var e = 8;
function t(e) {
	if (typeof e != "object" || !e || !("schemaVersion" in e) || e.schemaVersion !== 8) {
		let t = typeof e == "object" && e && "schemaVersion" in e ? String(e.schemaVersion) : "missing";
		throw Error(`Unsupported LaTeX syntax schema ${t}; expected 8`);
	}
}
//#endregion
export { e as LATEX_SYNTAX_SCHEMA_VERSION, t as assertLatexSyntaxSchemaVersion };
