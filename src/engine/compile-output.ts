/** Published controllers can attach a previous run's file after TeX exits early.
 * The explicit terminal no-output diagnostic overrides their status-1 success. */
export function hasFatalNoOutput(log: string): boolean {
  let noOutput = false
  for (const line of log.split(/\r?\n/)) {
    if (
      /^![ \t]*==>[ \t]*Fatal error occurred, no output (?:PDF|DVI) file produced![ \t]*$/.test(
        line,
      )
    )
      noOutput = true
    else if (/^Output written on /.test(line)) noOutput = false
  }
  return noOutput
}

export function compileArtifact(
  bytes: ArrayBuffer | undefined,
  noOutput: boolean,
): Uint8Array | null {
  return !noOutput && bytes ? new Uint8Array(bytes) : null
}
