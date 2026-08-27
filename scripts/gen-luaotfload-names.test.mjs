import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

test('normalizes wall-clock luaotfload database metadata', () => {
  const root = mkdtempSync(join(tmpdir(), 'wasmtex-luaotfload-'))
  const database = join(root, 'luaotfload-names.lua')
  writeFileSync(
    database,
    `return {
 ["meta"]={
  ["created"]="2026-08-27 12:34:56",
  ["modified"]="2026-08-27 12:34:57",
  ["version"]=6,
 },
 ["status"]={ ["font.otf"]={ ["timestamp"]=1787811407 } },
 ["markers"]="latinmodernroman lmroman10-regular.otf texgyretermes",
}\n`,
  )

  execFileSync(
    process.execPath,
    ['scripts/gen-luaotfload-names.mjs', '--db', database, '--normalize'],
    { cwd: new URL('..', import.meta.url) },
  )

  const normalized = readFileSync(database, 'utf8')
  assert.doesNotMatch(normalized, /2026-08-27|1787811407/)
  assert.match(normalized, /1970-01-01 00:00:00/)
  assert.match(normalized, /\["timestamp"\]=0/)
})
