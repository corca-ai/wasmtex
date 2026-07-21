// Command name alternation strings — single source of truth
export const REF_CMDS = 'ref|eqref|pageref|autoref|cref|Cref|nameref'
export const CITE_CMDS = 'cite|citep|citet|parencite|textcite|autocite|nocite'
export const INPUT_CMDS = 'input|include|subfile'
export const SECTION_CMDS = 'part|chapter|section|subsection|subsubsection|paragraph'
export const NEWCMD_CMDS = 'newcommand|renewcommand|providecommand'
export const USEPACKAGE_CMDS = 'usepackage|RequirePackage'
export const ENV_CMDS = 'begin|end'

/** A `\command` control-word token: a backslash + letters (and `@` under `\makeatletter`),
 *  capturing the bare name. LaTeX control words are letters-only, so a trailing digit/`_`
 *  is NOT part of the name (`\foo2` is `\foo` then `2`). Single source of truth for
 *  command-name matching across the parser, hover, definition, and references — keeping
 *  these in sync matters (provider drift has caused real bugs). Build a fresh regex per use
 *  (the `g` flag is stateful). */
export const COMMAND_TOKEN = String.raw`\\([a-zA-Z@]+)`

/** Find the first regex match in line that contains the given column */
export function findMatchAtCol(line: string, re: RegExp, col: number): RegExpMatchArray | null {
  for (const m of line.matchAll(re)) {
    if (col >= m.index && col < m.index + m[0].length) return m
  }
  return null
}
