//#region src/syntax-contract.ts
var e = 5;
function t(e) {
	if (typeof e != "object" || !e || !("schemaVersion" in e) || e.schemaVersion !== 5) {
		let t = typeof e == "object" && e && "schemaVersion" in e ? String(e.schemaVersion) : "missing";
		throw Error(`Unsupported LaTeX syntax schema ${t}; expected 5`);
	}
}
//#endregion
export { e as LATEX_SYNTAX_SCHEMA_VERSION, t as assertLatexSyntaxSchemaVersion };
