import { createHash } from 'node:crypto'

const FORBIDDEN_MARKERS = [
  'libs/pplib',
  'libpplib',
  'pplib.a',
  'ppdoc_',
  'ppdict_',
  'pparray_',
  'ppstream_',
  'ppref_',
  'utilsha',
]

function sha256(data) {
  return createHash('sha256').update(data).digest('hex')
}

function normalizeInputPath(path) {
  return path
    .replaceAll('\\', '/')
    .replace(/^\/build\/wasm(?:-[^/]+)?\//, 'texlive-build/')
    .replace(
      /^\/emsdk\/upstream\/emscripten\/cache\/sysroot\/lib\/wasm32-emscripten\//,
      'emscripten-sysroot/',
    )
}

export function inspectLinkMap(text, inputTrace = '') {
  const forbiddenMarkers = FORBIDDEN_MARKERS.filter((marker) => text.includes(marker) || inputTrace.includes(marker))
  const archives = new Map()
  const directObjects = new Set()

  for (const [chunk, traced] of [[text, false], [inputTrace, true]]) {
    for (const line of chunk.split(/\r?\n/)) {
      const archivePattern = /(\S+\.a)\(([^()\s]+)\)/g
      for (const match of line.matchAll(archivePattern)) {
        const path = normalizeInputPath(match[1])
        const entry = archives.get(path) ?? { path, members: new Set(), symbolReferences: 0 }
        entry.members.add(match[2])
        if (!traced) entry.symbolReferences++
        archives.set(path, entry)
      }

      const directObject = line.match(/\s([^\s()]+\.o):\(/)?.[1]
      if (directObject) directObjects.add(normalizeInputPath(directObject))
      if (traced && /^\S+\.o$/.test(line.trim())) directObjects.add(normalizeInputPath(line.trim()))
    }
  }

  return {
    sha256: sha256(text),
    forbiddenMarkers,
    archives: [...archives.values()]
      .map((entry) => ({
        path: entry.path,
        members: [...entry.members].sort(),
        symbolReferences: entry.symbolReferences,
      }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    directObjects: [...directObjects].sort(),
  }
}

export function createLinkInventory(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('at least one link map is required')
  }
  const revisions = new Set(entries.map((entry) => entry.receipt.sourceRevision))
  if (revisions.size !== 1) {
    throw new Error('all link maps must be tied to one source revision')
  }

  const seenFamilies = new Set()
  const maps = entries
    .map((entry) => {
      if (!/^[a-z][a-z0-9-]*$/.test(entry.family) || seenFamilies.has(entry.family)) {
        throw new Error(`invalid or duplicate link-map family: ${String(entry.family)}`)
      }
      seenFamilies.add(entry.family)
      if (!entry.receipt.buildId || !entry.receipt.family) {
        throw new Error(`${entry.family}: invalid build receipt`)
      }
      if (/\blto\.tmp:/.test(entry.mapText) && (!entry.inputTraceFile || !entry.inputTraceText || inspectLinkMap('', entry.inputTraceText).archives.length === 0)) {
        throw new Error(`${entry.family}: LTO map requires a linker input trace`)
      }
      const inspected = inspectLinkMap(entry.mapText, entry.inputTraceText)
      if (inspected.forbiddenMarkers.length > 0) {
        throw new Error(
          `${entry.family}: forbidden legacy marker(s): ${inspected.forbiddenMarkers.join(', ')}`,
        )
      }
      if (inspected.archives.length === 0) {
        throw new Error(`${entry.family}: link map contains no static archives`)
      }
      return {
        family: entry.family,
        mapFile: entry.mapFile,
        mapSha256: inspected.sha256,
        ...(entry.inputTraceText ? { inputTraceFile: entry.inputTraceFile, inputTraceSha256: sha256(entry.inputTraceText) } : {}),
        receiptFile: entry.receiptFile,
        receiptFamily: entry.receipt.family,
        buildId: entry.receipt.buildId,
        archives: inspected.archives,
        directObjects: inspected.directObjects,
      }
    })
    .sort((a, b) => a.family.localeCompare(b.family))

  return {
    schemaVersion: 1,
    sourceRevision: [...revisions][0],
    maps,
  }
}
