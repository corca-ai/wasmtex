//#region src/lsp/latex-patterns.ts
var e = "ref|eqref|pageref|autoref|cref|Cref|nameref", t = "cite|citep|citet|parencite|textcite|autocite|nocite", n = "input|include|subfile", r = "part|chapter|section|subsection|subsubsection|paragraph", i = "newcommand|renewcommand|providecommand", a = "usepackage|RequirePackage", o = "begin|end", s = String.raw`\\([a-zA-Z@]+)`;
//#endregion
export { t as CITE_CMDS, s as COMMAND_TOKEN, o as ENV_CMDS, n as INPUT_CMDS, i as NEWCMD_CMDS, e as REF_CMDS, r as SECTION_CMDS, a as USEPACKAGE_CMDS };
