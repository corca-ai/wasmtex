import { spawnSync } from 'node:child_process'

function requirePositiveInteger(value, label, maximum) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${label} must be an integer between 1 and ${maximum}`)
  }
}

export function buildProbeSandbox({
  platform = process.platform,
  command,
  args = [],
  timeoutMs = 5000,
  memoryMb = 256,
  available = () => false,
  unsafeTestMode = false,
}) {
  requirePositiveInteger(timeoutMs, 'probe timeout', 60_000)
  requirePositiveInteger(memoryMb, 'probe memory', 1024)
  if (!command || typeof command !== 'string') throw new Error('probe command is required')
  if (unsafeTestMode) return { command, args, timeoutMs, memoryMb, isolated: false }

  const memoryBytes = String(memoryMb * 1024 * 1024)
  const cpuSeconds = String(Math.max(1, Math.ceil(timeoutMs / 1000)))
  if (platform === 'linux') {
    if (!available('bwrap')) {
      throw new Error('network-isolated semantic probes require bubblewrap (bwrap) on Linux')
    }
    if (!available('prlimit')) {
      throw new Error('memory-bounded semantic probes require prlimit on Linux')
    }
    const inner = ['prlimit', `--as=${memoryBytes}`, `--cpu=${cpuSeconds}`, '--', command, ...args]
    return {
      command: 'bwrap',
      args: [
        '--die-with-parent',
        '--unshare-net',
        '--ro-bind',
        '/',
        '/',
        '--dev',
        '/dev',
        '--proc',
        '/proc',
        '--tmpfs',
        '/tmp',
        '--',
        ...inner,
      ],
      timeoutMs,
      memoryMb,
      isolated: true,
    }
  }
  if (platform === 'darwin') {
    if (!available('sandbox-exec')) {
      throw new Error('network-isolated semantic probes require sandbox-exec on macOS')
    }
    const profile =
      '(version 1) (deny default) (allow process*) (allow file-read*) ' +
      '(allow file-write* (subpath "/private/tmp") (subpath "/tmp")) (deny network*)'
    const memoryKb = String(memoryMb * 1024)
    return {
      command: 'sandbox-exec',
      args: [
        '-p',
        profile,
        '/bin/sh',
        '-c',
        'ulimit -v "$1"; shift; exec "$@"',
        'semantic-probe',
        memoryKb,
        command,
        ...args,
      ],
      timeoutMs,
      memoryMb,
      isolated: true,
    }
  }
  throw new Error(`network-isolated semantic probes are unsupported on ${platform}`)
}

export function validateProbeOutput(value, expected) {
  if (!value || typeof value !== 'object') throw new Error('probe output must be an object')
  if (value.schemaVersion !== 1) throw new Error('probe output schemaVersion must be 1')
  if (value.texliveYear !== expected.texliveYear) throw new Error('probe output TeX Live year mismatch')
  if (value.mirrorRevision !== expected.mirrorRevision) {
    throw new Error('probe output mirror revision mismatch')
  }
  if (!value.scopes || typeof value.scopes !== 'object' || Array.isArray(value.scopes)) {
    throw new Error('probe output must contain a scopes object')
  }
  return value
}

export function runProbeCommand({ plan, input, environment = process.env }) {
  const cleanEnvironment = {
    ...environment,
    http_proxy: '',
    https_proxy: '',
    HTTP_PROXY: '',
    HTTPS_PROXY: '',
    ALL_PROXY: '',
    NO_PROXY: '*',
    openin_any: 'p',
    openout_any: 'p',
    shell_escape: 'f',
    TEXMFOUTPUT: '/tmp',
  }
  const result = spawnSync(plan.command, plan.args, {
    input: `${JSON.stringify(input)}\n`,
    encoding: 'utf8',
    env: cleanEnvironment,
    timeout: plan.timeoutMs,
    maxBuffer: Math.min(plan.memoryMb * 1024 * 1024, 32 * 1024 * 1024),
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  if (result.error) {
    if (result.error.code === 'ETIMEDOUT') throw new Error(`semantic probe timed out after ${plan.timeoutMs}ms`)
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`semantic probe exited ${result.status}: ${result.stderr.trim()}`)
  }
  let value
  try {
    value = JSON.parse(result.stdout)
  } catch {
    throw new Error('semantic probe returned malformed JSON')
  }
  return validateProbeOutput(value, input)
}
