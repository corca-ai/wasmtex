import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

export function collectFormatRequests(page, version) {
  const requests = new Set()
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.protocol === 'https:' && url.pathname.includes(`/${version}/`)) {
      requests.add(url.href)
    }
  })
  return requests
}

export function writeFormatInputEvidence({ output, engine, formatPath, requests, procedure }) {
  if (!output) return
  const bytes = readFileSync(formatPath)
  const evidence = {
    schemaVersion: 1,
    engine,
    formatFile: formatPath.split('/').at(-1),
    formatBytes: bytes.length,
    formatSha256: createHash('sha256').update(bytes).digest('hex'),
    procedure,
    fetchedInputs: [...requests].sort(),
  }
  writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`)
}
