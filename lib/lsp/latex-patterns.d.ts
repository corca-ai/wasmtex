export declare const REF_CMDS = "ref|eqref|pageref|autoref|cref|Cref|nameref";
export declare const CITE_CMDS = "cite|citep|citet|parencite|textcite|autocite|nocite";
export declare const INPUT_CMDS = "input|include|subfile";
export declare const SECTION_CMDS = "part|chapter|section|subsection|subsubsection|paragraph";
export declare const NEWCMD_CMDS = "newcommand|renewcommand|providecommand";
export declare const USEPACKAGE_CMDS = "usepackage|RequirePackage";
export declare const ENV_CMDS = "begin|end";
/** A `\command` control-word token: a backslash + letters (and `@` under `\makeatletter`),
 *  capturing the bare name. LaTeX control words are letters-only, so a trailing digit/`_`
 *  is NOT part of the name (`\foo2` is `\foo` then `2`). Single source of truth for
 *  command-name matching across the parser, hover, definition, and references — keeping
 *  these in sync matters (provider drift has caused real bugs). Build a fresh regex per use
 *  (the `g` flag is stateful). */
export declare const COMMAND_TOKEN: string;
/** Find the first regex match in line that contains the given column */
export declare function findMatchAtCol(line: string, re: RegExp, col: number): RegExpMatchArray | null;
