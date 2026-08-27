import { execFileSync } from 'node:child_process'

export function objectStoreConfig(env = process.env) {
  const bucket = env.TEXLIVE_OBJECT_BUCKET ?? env.S3_BUCKET ?? 'corca-fastlatex-texlib'
  const endpoint = env.TEXLIVE_OBJECT_ENDPOINT?.trim() || undefined
  const profile = env.TEXLIVE_OBJECT_PROFILE?.trim() || undefined
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

export function awsArgs(config, args) {
  const out = []
  if (config.profile) out.push('--profile', config.profile)
  if (config.endpoint) out.push('--endpoint-url', config.endpoint)
  return [...out, ...args]
}

export function runObjectStore(config, args, options = {}) {
  return execFileSync('aws', awsArgs(config, args), options)
}
