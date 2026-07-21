#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const version = process.argv[2] ?? '2025'
const inventoryPath = resolve(root, `scripts/engine-components-${version}.json`)
const inventoryBytes = readFileSync(inventoryPath)
const inventory = JSON.parse(inventoryBytes)
const inventorySha = createHash('sha256').update(inventoryBytes).digest('hex')

function id(value) {
  return `SPDXRef-${value.replaceAll(/[^A-Za-z0-9.-]/g, '-')}`
}

const documentId = 'SPDXRef-DOCUMENT'
const packages = inventory.components.map((component) => ({
  SPDXID: id(component.id),
  name: component.id,
  versionInfo: component.version,
  downloadLocation: 'NOASSERTION',
  filesAnalyzed: false,
  licenseConcluded: component.licenseExpression,
  licenseDeclared: component.licenseExpression,
  copyrightText: 'NOASSERTION',
  comment: JSON.stringify({
    archivePatterns: component.archivePatterns,
    noticeFiles: component.noticeFiles,
    sourceNoticePaths: component.sourceNoticePaths,
    ...(component.licenseSelection ? { licenseSelection: component.licenseSelection } : {}),
    ...(component.staticLinking ? { staticLinking: component.staticLinking } : {}),
  }),
}))

const document = {
  spdxVersion: 'SPDX-2.3',
  dataLicense: 'CC0-1.0',
  SPDXID: documentId,
  name: `WasmTex engine components ${version} ${inventory.linkInventorySourceRevision.slice(0, 7)}`,
  documentNamespace: `https://github.com/corca-ai/wasmtex/sbom/${version}/${inventory.linkInventorySourceRevision}/${inventorySha}`,
  creationInfo: {
    created: inventory.sbomCreated,
    creators: ['Organization: WasmTex project', 'Tool: scripts/gen-engine-sbom.mjs'],
  },
  documentDescribes: packages.map((pkg) => pkg.SPDXID),
  packages,
  relationships: packages.map((pkg) => ({
    spdxElementId: documentId,
    relationshipType: 'DESCRIBES',
    relatedSpdxElement: pkg.SPDXID,
  })),
}

const output = `${JSON.stringify(document, null, 2)}\n`
const checkIndex = process.argv.indexOf('--check')
if (checkIndex !== -1) {
  const target = process.argv[checkIndex + 1]
  if (!target) throw new Error('--check requires an SPDX JSON path')
  if (readFileSync(resolve(root, target), 'utf8') !== output) {
    console.error(`${target} is stale; regenerate it with node scripts/gen-engine-sbom.mjs ${version}`)
    process.exit(1)
  }
  console.log(`Engine SPDX SBOM is current: ${target}`)
} else {
  process.stdout.write(output)
}
