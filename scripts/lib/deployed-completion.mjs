import { createHash } from 'node:crypto'

function resourceUrl(baseUrl, key) {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/')
  return `${baseUrl.replace(/\/+$/, '')}/${encodedKey}`
}

async function digestBody(body) {
  const hash = createHash('sha256')
  let bytes = 0
  for await (const chunk of body) {
    const value = Buffer.from(chunk)
    bytes += value.length
    hash.update(value)
  }
  return { bytes, sha256: hash.digest('hex') }
}

export async function checkDeployedCompletionInventory({
  manifest,
  baseUrl,
  fetchImpl = fetch,
  concurrency = 12,
}) {
  if (manifest?.scope !== 'completion-metadata') {
    throw new Error('deployed completion verification requires a completion-metadata manifest')
  }
  if (!/^https:\/\//.test(baseUrl ?? '')) {
    throw new Error('deployed completion base URL must use HTTPS')
  }
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 64) {
    throw new Error('deployed completion concurrency must be an integer from 1 to 64')
  }

  const failures = new Array(manifest.files.length)
  let cursor = 0
  let checkedFiles = 0
  let checkedBytes = 0
  const worker = async () => {
    while (true) {
      const index = cursor++
      if (index >= manifest.files.length) return
      const file = manifest.files[index]
      try {
        const response = await fetchImpl(resourceUrl(baseUrl, file.key))
        if (!response.ok) {
          failures[index] = `${file.key}: deployed resource returned HTTP ${response.status}`
          continue
        }
        if (!response.body) {
          failures[index] = `${file.key}: deployed resource has no response body`
          continue
        }
        const actual = await digestBody(response.body)
        if (actual.bytes !== file.bytes) {
          failures[index] = `${file.key}: deployed byte size mismatch`
          continue
        }
        if (actual.sha256 !== file.sha256) {
          failures[index] = `${file.key}: deployed SHA-256 mismatch`
          continue
        }
        checkedFiles++
        checkedBytes += actual.bytes
      } catch (error) {
        failures[index] = `${file.key}: deployed resource fetch failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, manifest.files.length) }, () => worker()),
  )
  return { checkedFiles, checkedBytes, failures: failures.filter(Boolean) }
}
