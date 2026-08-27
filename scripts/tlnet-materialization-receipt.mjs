#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  createMaterializationReceipt,
  verifyMaterializationReceipt,
} from './lib/tlnet-materialization.mjs'

const [mode, configArg, texmfArg, tlpdbArg, receiptArg] = process.argv.slice(2)
if (!['write', 'check'].includes(mode) || !configArg || !texmfArg || !tlpdbArg || !receiptArg) {
  throw new Error('usage: tlnet-materialization-receipt.mjs <write|check> <config> <texmf-dist> <tlpdb> <receipt>')
}
const config = JSON.parse(readFileSync(resolve(configArg), 'utf8'))
const input = {
  config,
  texmfDist: resolve(texmfArg),
  tlpdbPath: resolve(tlpdbArg),
}
if (mode === 'write') {
  const receipt = createMaterializationReceipt(input)
  writeFileSync(resolve(receiptArg), `${JSON.stringify(receipt, null, 2)}\n`)
  console.log(`wrote materialization receipt ${receiptArg} (${receipt.tree.sha256})`)
} else {
  const receipt = JSON.parse(readFileSync(resolve(receiptArg), 'utf8'))
  verifyMaterializationReceipt({ ...input, receipt })
  console.log(`verified materialized tlnet tree ${receipt.tree.sha256}`)
}
