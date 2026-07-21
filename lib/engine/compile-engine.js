import { WasmTexLuatexEngine as t } from "./luatex-engine.js";
import { WasmTexPdftexEngine as a } from "./wasmtex-engine.js";
import { WasmTexXetexEngine as l } from "./xetex-engine.js";
function o(e) {
  return e === "xelatex" ? "XeLaTeX" : e === "lualatex" ? "LuaLaTeX" : "pdfLaTeX";
}
function f(e, n = {}) {
  return e === "xelatex" ? new l(n) : e === "lualatex" ? new t(n) : new a(n);
}
function g(e, n) {
  const i = o(e.engine), r = n instanceof Error ? ` (${n.message})` : "";
  return {
    success: !1,
    pdf: null,
    log: [
      `! WasmTex engine error: this document requires ${i} (${e.reason}).`,
      `The ${i} engine is not available in this build${r}.`,
      "Install the Unicode engine artifact, or change the document to compile with pdfLaTeX.",
      "See docs/engine.md (Multi-engine support)."
    ].join(`
`),
    errors: [
      {
        line: 0,
        severity: "error",
        message: `Document requires ${i}, which is not available in this build.`
      }
    ],
    compileTime: 0,
    synctex: null
  };
}
export {
  f as createCompileEngine,
  o as engineDisplayName,
  g as unavailableEngineResult
};
