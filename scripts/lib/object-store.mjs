import { execFileSync } from 'node:child_process'

export function objectStoreConfig(env = process.env) {
  const provider = env.TEXLIVE_OBJECT_PROVIDER?.trim() || 'r2'
  if (provider !== 'r2' && provider !== 's3') {
    throw new Error('TEXLIVE_OBJECT_PROVIDER must be r2 or s3')
  }
  if (provider === 's3' && !env.TEXLIVE_OBJECT_BUCKET?.trim()) {
    throw new Error('TEXLIVE_OBJECT_BUCKET is required for S3 access')
  }
  const bucket = env.TEXLIVE_OBJECT_BUCKET ?? 'corca-texlive-production'
  const endpoint = env.TEXLIVE_OBJECT_ENDPOINT?.trim() || undefined
  const profile = env.TEXLIVE_OBJECT_PROFILE?.trim()
    || (provider === 'r2' ? env.TEXLIVE_R2_PROFILE?.trim() : undefined)
  const region = env.TEXLIVE_OBJECT_REGION?.trim() || undefined
  const prefix = (env.TEXLIVE_OBJECT_PREFIX ?? '').replace(/^\/+|\/+$/g, '')
  return { bucket, endpoint, profile, prefix, provider, region }
}

export function objectUri(config, ...segments) {
  const key = [config.prefix, ...segments]
    .filter(Boolean)
    .map((part) => String(part).replace(/^\/+|\/+$/g, ''))
    .join('/')
  return `s3://${config.bucket}/${key}`
}

export function objectStoreCliArgs(config, args) {
  const out = []
  if (config.profile) out.push('--profile', config.profile)
  if (config.provider === 's3') {
    if (config.endpoint) throw new Error('TEXLIVE_OBJECT_ENDPOINT must be unset for S3 access')
    if (!config.region) throw new Error('TEXLIVE_OBJECT_REGION is required for S3 access')
    return [...out, '--region', config.region, ...args]
  }
  if (!config.endpoint) {
    throw new Error('TEXLIVE_OBJECT_ENDPOINT is required for R2 access')
  }
  const endpoint = new URL(config.endpoint)
  if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.r2.cloudflarestorage.com')) {
    throw new Error('TEXLIVE_OBJECT_ENDPOINT must be a Cloudflare R2 endpoint')
  }
  out.push('--endpoint-url', config.endpoint)
  return [...out, ...args]
}

export function runObjectStore(config, args, options = {}) {
  return execFileSync('aws', objectStoreCliArgs(config, args), options)
}
