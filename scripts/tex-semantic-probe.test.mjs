import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildProbeSandbox,
  runProbeCommand,
  validateProbeOutput,
} from './lib/tex-semantic-probe.mjs'

const input = {
  schemaVersion: 1,
  texliveYear: '2025',
  mirrorRevision: '2025-0123456789abcdef',
  scopes: {},
}

test('builds a Linux sandbox with network and resource isolation', () => {
  const plan = buildProbeSandbox({
    platform: 'linux',
    command: '/probe',
    args: ['--json'],
    timeoutMs: 4000,
    memoryMb: 128,
    available: (command) => command === 'bwrap' || command === 'prlimit',
  })
  assert.equal(plan.command, 'bwrap')
  assert.ok(plan.args.includes('--unshare-net'))
  assert.ok(plan.args.includes('--tmpfs'))
  assert.ok(plan.args.some((arg) => arg === '--as=134217728'))
  assert.ok(plan.args.some((arg) => arg === '--cpu=4'))
})

test('builds a macOS sandbox that denies network and bounds virtual memory', () => {
  const plan = buildProbeSandbox({
    platform: 'darwin',
    command: '/probe',
    timeoutMs: 3000,
    memoryMb: 64,
    available: (command) => command === 'sandbox-exec',
  })
  assert.equal(plan.command, 'sandbox-exec')
  assert.match(plan.args.join(' '), /deny network/)
  assert.ok(plan.args.includes('65536'))
})

test('fails closed when OS network isolation is unavailable', () => {
  assert.throws(
    () => buildProbeSandbox({ platform: 'linux', command: '/probe' }),
    /require bubblewrap/,
  )
  assert.throws(
    () => buildProbeSandbox({ platform: 'win32', command: '/probe' }),
    /unsupported/,
  )
})

test('runs the JSON probe contract with bounded unsafe mode only for tests', () => {
  const script =
    'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write(s))'
  const plan = buildProbeSandbox({
    command: process.execPath,
    args: ['-e', script],
    timeoutMs: 1000,
    memoryMb: 64,
    unsafeTestMode: true,
  })
  assert.deepEqual(runProbeCommand({ plan, input }), input)
})

test('rejects stale or malformed observed metadata', () => {
  assert.throws(
    () => validateProbeOutput({ ...input, mirrorRevision: '2025-fedcba9876543210' }, input),
    /mirror revision mismatch/,
  )
  assert.throws(() => validateProbeOutput({ ...input, scopes: [] }, input), /scopes object/)
})
