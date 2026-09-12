// Read-only public asset diagnostic. curl retains the encoded response body;
// Node fetch would transparently decode it and obscure the transfer comparison.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { brotliCompressSync, brotliDecompressSync, constants, gunzipSync, gzipSync } from 'node:zlib'

const { values } = parseArgs({ options: {
  url: { type: 'string', multiple: true },
  repetitions: { type: 'string', default: '3' },
  out: { type: 'string' },
} })
const repetitions = Number(values.repetitions)
if (!values.url?.length || !values.out || !Number.isInteger(repetitions) || repetitions < 1 || repetitions > 20) {
  throw new Error('Usage: node scripts/profile-http-compression.mjs --url <public-url> [--url ...] --out <json> [--repetitions 3]')
}
for (const input of values.url) {
  const url = new URL(input)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Use public HTTP(S) asset URLs without credentials, query strings or fragments.')
  }
}
await mkdir(path.dirname(path.resolve(values.out)), { recursive: true })
const directory = await mkdtemp(path.join(tmpdir(), 'wasmtex-http-compression-'))
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const report = {
  schemaVersion: 1, node: process.version, curl: execFileSync('curl', ['--version'], { encoding: 'utf8' }).split('\n')[0],
  repetitions, samples: [],
  limitations: [
    'Sequential fresh curl processes: no browser connection reuse, HTTP/SW cache or UI timing.',
    'CDN edge caches are not reset. Encoding order alternates; edge and network variation remain.',
    'encodedBodyBytes counts payload, not TLS/HTTP framing. No redirects are followed.',
    'Local gzip/Brotli sizes are potential representations, not deployed transfer savings.',
    'Decoded SHA equality compares HTTP representations; it does not qualify a compiler change.',
  ],
}
try {
  for (let repeat = 0; repeat < repetitions; repeat++) {
    for (const url of values.url) {
      for (const acceptEncoding of repeat % 2 ? ['br, gzip', 'identity'] : ['identity', 'br, gzip']) {
        const bodyPath = path.join(directory, 'body')
        const headersPath = path.join(directory, 'headers')
        const metrics = JSON.parse(execFileSync('curl', [
          '--silent', '--show-error', '--max-time', '60', '--max-filesize', '67108864',
          '--header', `Accept-Encoding: ${acceptEncoding}`, '--dump-header', headersPath,
          '--output', bodyPath, '--write-out', '%{json}', url,
        ], { encoding: 'utf8', maxBuffer: 1024 * 1024 }))
        const headers = (await readFile(headersPath, 'utf8')).trim().split(/\r?\n\r?\n/).at(-1)
        const fields = Object.fromEntries(headers.split(/\r?\n/).slice(1).map(line => {
          const colon = line.indexOf(':')
          return [line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim()]
        }))
        const encoded = await readFile(bodyPath)
        const encoding = fields['content-encoding'] ?? 'identity'
        const decoded = encoding === 'gzip' ? gunzipSync(encoded, { maxOutputLength: 128 * 1024 * 1024 })
          : encoding === 'br' ? brotliDecompressSync(encoded, { maxOutputLength: 128 * 1024 * 1024 })
          : encoding === 'identity' ? encoded : null
        if (!decoded) throw new Error(`Unsupported Content-Encoding: ${encoding}`)
        const sample = {
          repeat, url, acceptEncoding, status: metrics.http_code, encoding,
          contentType: fields['content-type'] ?? null, cacheStatus: fields['cf-cache-status'] ?? null,
          cacheControl: fields['cache-control'] ?? null, edge: fields['cf-ray']?.split('-').at(-1) ?? null,
          encodedBodyBytes: encoded.length, decodedBodyBytes: decoded.length,
          payloadGzipMagic: decoded[0] === 0x1f && decoded[1] === 0x8b,
          decodedSha256: sha256(decoded), ttfbSeconds: metrics.time_starttransfer, totalSeconds: metrics.time_total,
        }
        if (metrics.http_code === 200 && repeat === 0 && acceptEncoding === 'identity') {
          sample.localRepresentationBytes = {
            gzip6: gzipSync(decoded, { level: 6 }).length,
            brotli5: brotliCompressSync(decoded, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }).length,
          }
        }
        report.samples.push(sample)
        await writeFile(values.out, `${JSON.stringify(report, null, 2)}\n`)
        console.log(JSON.stringify(sample))
      }
    }
  }
  for (const url of values.url) {
    const successful = report.samples.filter(sample => sample.url === url && sample.status === 200)
    if (successful.length !== repetitions * 2 || new Set(successful.map(sample => sample.decodedSha256)).size !== 1) {
      process.exitCode = 1
      report.validationError = 'One or more URLs failed or changed decoded bytes; inspect samples.'
    }
  }
  await writeFile(values.out, `${JSON.stringify(report, null, 2)}\n`)
} finally {
  await rm(directory, { recursive: true, force: true })
}
