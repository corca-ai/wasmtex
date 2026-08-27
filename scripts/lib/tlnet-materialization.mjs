import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const SHA256 = /^[a-f0-9]{64}$/i
const SHA512 = /^[a-f0-9]{128}$/i

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

export function materializedTreeIdentity(root) {
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`materialized texmf-dist does not exist: ${root}`)
  }
  const paths = []
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) paths.push(path)
      else throw new Error(`unsupported materialized tree entry: ${path}`)
    }
  }
  visit(root)
  const digest = createHash('sha256')
  let bytes = 0
  for (const path of paths) {
    const data = readFileSync(path)
    const name = relative(root, path).split(sep).join('/')
    bytes += data.length
    digest.update(`${name}\0${data.length}\0${sha256(data)}\n`)
  }
  return { files: paths.length, bytes, sha256: digest.digest('hex') }
}

export function createMaterializationReceipt({ config, texmfDist, tlpdbPath }) {
  if (config.sourceType !== 'tlnet-repository') {
    throw new Error('materialization receipt requires sourceType=tlnet-repository')
  }
  const tlpdbSha256 = sha256(readFileSync(tlpdbPath))
  if (tlpdbSha256 !== config.tlpdb?.sha256) throw new Error('materialization TLPDB mismatch')
  if (!SHA512.test(config.installer?.sha512 ?? '')) throw new Error('invalid installer SHA-512')
  return {
    schemaVersion: 1,
    texliveYear: config.texliveYear,
    repository: config.repository,
    installer: { filename: config.installer.filename, sha512: config.installer.sha512 },
    tlpdbSha256,
    tree: materializedTreeIdentity(texmfDist),
  }
}

export function verifyMaterializationReceipt({ receipt, config, texmfDist, tlpdbPath }) {
  const expected = createMaterializationReceipt({ config, texmfDist, tlpdbPath })
  if (receipt.schemaVersion !== 1) throw new Error('materialization receipt schema is invalid')
  if (!SHA256.test(receipt.tree?.sha256 ?? '')) throw new Error('materialization tree hash is invalid')
  if (JSON.stringify(receipt) !== JSON.stringify(expected)) {
    throw new Error('materialized tlnet tree does not match its verification receipt')
  }
  return expected
}
