const e = "ref|eqref|pageref|autoref|cref|Cref|nameref", t = "cite|citep|citet|parencite|textcite|autocite|nocite", c = "input|include|subfile", n = "part|chapter|section|subsection|subsubsection|paragraph", a = "newcommand|renewcommand|providecommand", o = "usepackage|RequirePackage", r = "begin|end", i = String.raw`\\([a-zA-Z@]+)`;
export {
  t as CITE_CMDS,
  i as COMMAND_TOKEN,
  r as ENV_CMDS,
  c as INPUT_CMDS,
  a as NEWCMD_CMDS,
  e as REF_CMDS,
  n as SECTION_CMDS,
  o as USEPACKAGE_CMDS
};
