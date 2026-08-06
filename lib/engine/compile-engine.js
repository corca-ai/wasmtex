import { WasmTexPdftexEngine as e } from "./wasmtex-engine.js";
import { WasmTexLuatexEngine as t } from "./luatex-engine.js";
import { WasmTexXetexEngine as n } from "./xetex-engine.js";
//#region src/engine/compile-engine.ts
function r(e) {
	return e === "xelatex" ? "XeLaTeX" : e === "lualatex" ? "LuaLaTeX" : "pdfLaTeX";
}
function i(r, i = {}) {
	return r === "xelatex" ? new n(i) : r === "lualatex" ? new t(i) : new e(i);
}
function a(e, t) {
	let n = r(e.engine), i = t instanceof Error ? ` (${t.message})` : "";
	return {
		success: !1,
		pdf: null,
		log: [
			`! WasmTex engine error: this document requires ${n} (${e.reason}).`,
			`The ${n} engine is not available in this build${i}.`,
			"Install the Unicode engine artifact, or change the document to compile with pdfLaTeX.",
			"See docs/engine.md (Multi-engine support)."
		].join("\n"),
		errors: [{
			line: 0,
			severity: "error",
			message: `Document requires ${n}, which is not available in this build.`
		}],
		compileTime: 0,
		synctex: null
	};
}
//#endregion
export { i as createCompileEngine, r as engineDisplayName, a as unavailableEngineResult };
