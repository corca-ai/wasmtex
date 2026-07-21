/**
 * Strip TeX line comments for lightweight directive detection (e.g. deciding
 * whether a source uses `\bibliography`, `\makeindex`, …).
 *
 * A `%` starts a comment unless it is escaped — i.e. preceded by an **odd**
 * number of backslashes. So `\%` is a literal percent (kept), but `\\%` (an
 * escaped backslash followed by `%`) IS a comment. The regex consumes a leading
 * non-backslash (or line start) plus any run of *paired* backslashes before the
 * `%`; an even backslash run leaves the `%` as a comment, while an odd run can
 * never align the trailing `%` so the literal percent (and everything after it)
 * survives. `$1$2` preserves the leading char and the paired backslashes.
 */
export function stripTexComments(source: string): string {
  return source.replace(/(^|[^\\])((?:\\\\)*)%.*$/gm, '$1$2')
}
