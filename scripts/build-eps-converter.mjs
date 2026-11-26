import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const pkg = join(root, 'packages/eps-converter')
const output = resolve(process.argv[2] ?? join(root, 'report/eps-converter/build'))
execFileSync('bash', [join(pkg, 'native/build.sh'), output], { stdio: 'inherit' })
mkdirSync(join(pkg, 'assets'), { recursive: true })
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const files = {}
for (const name of ['stet.js', 'stet_bg.wasm', 'LICENSE-URW-FONTS.txt', 'THIRD_PARTY_NOTICES.txt']) {
  const bytes = readFileSync(join(output, 'package', name))
  if (!bytes.length) throw new Error(`Empty EPS runtime file: ${name}`)
  cpSync(join(output, 'package', name), join(pkg, 'assets', name))
  files[name] = { bytes: bytes.length, sha256: digest(bytes) }
}
function inventory(dir, prefix = '') {
  return Object.fromEntries(readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const name = prefix + entry.name
    return entry.isDirectory()
      ? Object.entries(inventory(join(dir, entry.name), `${name}/`))
      : [[name, digest(readFileSync(join(dir, entry.name)))]]
  }))
}
writeFileSync(join(pkg, 'assets/manifest.json'), JSON.stringify({
  schemaVersion: 1,
  name: '@wasmtex/eps-converter',
  version: '0.1.0',
  stet: { version: '0.11.0', revision: '0184a97bc3d902e2e63d145925448aeb43566d10',
    sourceSha256: '9a45f0f1835750a5e54cdbc5c5413a3e93b2aad9f4d917047aa983cf8cfc98a2' },
  toolchain: { rust: '1.96.0', wasmBindgen: '0.2.128', cargoAbout: '0.9.3' },
  limits: { inputBytes: 16777216, wasmMemoryBytes: 134217728, localVmBytes: 67108864, pages: 1 },
  nativeSources: inventory(join(pkg, 'native')),
  files,
}, null, 2) + '\n')
rmSync(join(pkg, 'dist'), { recursive: true, force: true })
execFileSync(join(root, 'node_modules/.bin/tsc'), ['-p', join(pkg, 'tsconfig.json')], { stdio: 'inherit' })
console.log(`Built optional EPS package in ${pkg}`)
