import { execFileSync } from 'node:child_process'

export function objectStoreConfig(env = process.env) {
  const bucket = env.TEXLIVE_OBJECT_BUCKET ?? 'corca-texlive-production'
  const endpoint = env.TEXLIVE_OBJECT_ENDPOINT?.trim() || undefined
  const profile = env.TEXLIVE_R2_PROFILE?.trim() || undefined
  const prefix = (env.TEXLIVE_OBJECT_PREFIX ?? '').replace(/^\/+|\/+$/g, '')
  return { bucket, endpoint, profile, prefix }
}

export function objectUri(config, ...segments) {
  const key = [config.prefix, ...segments]
    .filter(Boolean)
    .map((part) => String(part).replace(/^\/+|\/+$/g, ''))
    .join('/')
  return `s3://${config.bucket}/${key}`
}

export function r2CliArgs(config, args) {
  if (!config.endpoint) {
    throw new Error('TEXLIVE_OBJECT_ENDPOINT is required for R2 access')
  }
  const endpoint = new URL(config.endpoint)
  if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.r2.cloudflarestorage.com')) {
    throw new Error('TEXLIVE_OBJECT_ENDPOINT must be a Cloudflare R2 endpoint')
  }
  const out = []
  if (config.profile) out.push('--profile', config.profile)
  out.push('--endpoint-url', config.endpoint)
  return [...out, ...args]
}

export function runObjectStore(config, args, options = {}) {
  return execFileSync('aws', r2CliArgs(config, args), options)
}
