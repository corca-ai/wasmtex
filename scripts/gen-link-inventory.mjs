#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { createLinkInventory } from './lib/link-inventory.mjs'

const [output, ...args] = process.argv.slice(2)
if (!output || args.length === 0 || args.length % 3 !== 0) {
  console.error(
    'usage: node scripts/gen-link-inventory.mjs <output.json> ' +
      '<family> <link.map> <BUILD-RECEIPT.json> [...]',
  )
  process.exit(1)
}

try {
  const entries = []
  for (let index = 0; index < args.length; index += 3) {
    const [family, mapPath, receiptPath] = args.slice(index, index + 3)
    entries.push({
      family,
      mapFile: basename(mapPath),
      mapText: readFileSync(mapPath, 'utf8'),
      receiptFile: basename(receiptPath),
      receipt: JSON.parse(readFileSync(receiptPath, 'utf8')),
    })
  }
  const inventory = createLinkInventory(entries)
  writeFileSync(output, `${JSON.stringify(inventory, null, 2)}\n`)
  console.log(`wrote ${output} (${inventory.maps.length} link maps)`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
