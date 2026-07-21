export interface SemanticTrace {
  labels: Set<string> // engine-processed \label keys
  refs: Set<string> // engine-processed \ref keys
}

export function parseTraceFile(content: string): SemanticTrace {
  const labels = new Set<string>()
  const refs = new Set<string>()
  // Split on \r?\n and trim the key so CRLF-terminated lines or stray whitespace
  // can't leave a `\r` on a key (which would never match the source-side keys).
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith('L:')) labels.add(line.slice(2).trim())
    else if (line.startsWith('R:')) refs.add(line.slice(2).trim())
  }
  return { labels, refs }
}
