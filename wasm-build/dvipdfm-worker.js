/* =============================================================================
 * dvipdfm-worker.js — authored worker controller for dvipdfmx
 * =============================================================================
 *
 * Published verbatim as wasmtex-dvipdfm.worker.js. It configures Module, owns the
 * protocol/cache policy, then imports the generated wasmtex-dvipdfm.js core. The
 * WebAssembly itself is the GPL dvipdfmx engine built from texlive-source.
 *
 * Protocol:
 *   compilepdf → run _compilePDF on the .xdv the driver wrote, post back the .pdf.
 *   settexliveurl / writefile / readfile / mkdir / setmainfile / flushcache / grace.
 *
 * Resolves TeX Live files over HTTP against THIS project's CDN layout
 * (`${endpoint}/pdftex/<format>/<name>`, shared with the pdfTeX mirror), routing by
 * extension (.otf→47, .ttf/.ttc→36, .pfb→32, .afm→4) and appending the kpse format's
 * canonical extension for extension-less lookups — exactly like the XeTeX glue.
 * ========================================================================== */

const TEXCACHEROOT = '/tex'
const WORKROOT = '/work'
// biome-ignore lint: emscripten populates Module
var Module = self.Module = {}
if (self.__wasmtexWasmBinary) Module.wasmBinary = self.__wasmtexWasmBinary
self.memlog = ''
self.mainfile = 'main.tex'
self.texlive_endpoint = ''

Module.print = (a) => {
  self.memlog += `${a}\n`
}
Module.printErr = (a) => {
  self.memlog += `${a}\n`
}
Module.preRun = () => {
  FS.mkdir(TEXCACHEROOT)
  FS.mkdir(WORKROOT)
}
Module.postRun = () => {
  self.postMessage({ result: 'ok' })
  self.initmem = dumpHeapMemory() // pristine post-init heap, restored before each compile (#82)
}
Module.onAbort = () => {
  self.memlog += 'Engine crashed'
  self.postMessage({ result: 'failed', status: -254, log: self.memlog, cmd: 'compile' })
}

function _allocate(content) {
  const res = _malloc(content.length)
  HEAPU8.set(new Uint8Array(content), res)
  return res
}

// --- Heap snapshot: reset C state between compiles in the same worker ----------
// dvipdfmx's main() is NOT re-entrant — its globals (loaded-font table, fontmap hash,
// page device) persist across calls under EXIT_RUNTIME=0, so a warm 2nd compile fails
// with "No font selected!" and the 3rd crashes (#82). Snapshot the pristine post-init
// heap and restore it before every compile. The font/map cache lives in MEMFS (JS
// side, outside the wasm heap), so it survives the restore — no re-fetch. Mirrors the
// xetex worker. `.set(initmem)` into a (possibly grown) buffer rewrites only the
// pristine prefix; the grown tail is unused capacity, which is correct.
function dumpHeapMemory() {
  const src = HEAPU8.buffer
  const dst = new Uint8Array(src.byteLength)
  dst.set(new Uint8Array(src))
  return dst
}
function restoreHeapMemory() {
  if (self.initmem) new Uint8Array(HEAPU8.buffer).set(self.initmem)
}

/** Run an engine entry point. The from-texlive-source dvipdfmx ends by calling
 *  exit(); under emscripten that throws ExitStatus instead of returning, so catch it
 *  and surface the exit code (the .pdf was written before exit). */
function runEngine(fn) {
  try {
    return fn()
  } catch (e) {
    if (e && (e.name === 'ExitStatus' || typeof e.status === 'number')) return e.status
    // A wasm trap (RuntimeError) or other JS error — NOT a normal exit. Record it and
    // return a non-zero status so the driver reports a clear failure. Re-throwing here
    // lets the error escape the message handler with no result posted, which looks
    // exactly like a hang (#52: a paperinit signature-mismatch trap masqueraded as a
    // hang for precisely this reason).
    self.memlog += `\nEngine error: ${(e && e.stack) || e}\n`
    return -1
  }
}

/** texmf.cnf for the from-source dvipdfmx's REAL libkpathsea (font search paths). */
function writeTexmfCnf() {
  const c = `${TEXCACHEROOT}//`
  FS.writeFile(
    `${WORKROOT}/texmf.cnf`,
    [
      `TEXMFCNF = .;${WORKROOT}`,
      `TEXFONTMAPS = .;${c}`,
      `OPENTYPEFONTS = .;${c}`,
      `TTFONTS = .;${c}`,
      `T1FONTS = .;${c}`,
      `TFMFONTS = .;${c}`,
      `VFFONTS = .;${c}`,
      `ENCFONTS = .;${c}`,
      `CMAPFONTS = .;${c}`,
      `TEXPSHEADERS = .;${c}`,
      `TEXINPUTS = .;${c}`,
      '',
    ].join('\n'),
  )
}

function cleanDir(dir) {
  for (const item of FS.readdir(dir)) {
    if (item === '.' || item === '..') continue
    const path = `${dir}/${item}`
    let st
    try {
      st = FS.stat(path)
    } catch {
      continue
    }
    if (FS.isDir(st.mode)) cleanDir(path)
    else {
      try {
        FS.unlink(path)
      } catch {}
    }
  }
  if (dir !== WORKROOT) {
    try {
      FS.rmdir(dir)
    } catch {}
  }
}

/** Run dvipdfmx on the .xdv the driver wrote, then post back the produced .pdf.
 *  Restores the pristine heap first so repeated compiles on one worker each start
 *  from a clean dvipdfmx state (#82). */
function compilePDFRoutine() {
  self.memlog = ''
  restoreHeapMemory()
  FS.chdir(WORKROOT)
  // Real libkpathsea (from-source dpx) derives the program dir from argv[0] (no
  // /proc/self/exe under WASM); a dummy absolute binary + texmf.cnf let SELFAUTO*
  // resolve to /work and find the search paths.
  try {
    FS.writeFile(`${WORKROOT}/xdvipdfmx`, '')
  } catch {}
  writeTexmfCnf()
  cwrap('setMainEntry', 'number', ['string'])(self.mainfile)
  const status = runEngine(_compilePDF)
  if (status !== 0) {
    self.postMessage({ result: 'failed', status, log: self.memlog, cmd: 'compile' })
    return
  }
  try {
    // The driver sets the main file to the .xdv (e.g. main.xdv); dvipdfmx writes
    // main.pdf. Strip whatever final extension the main file has, not just .tex.
    const pdf = FS.readFile(`${WORKROOT}/${self.mainfile.replace(/\.[^.]+$/, '')}.pdf`, {
      encoding: 'binary',
    })
    self.postMessage(
      { result: 'ok', status: 0, log: self.memlog, pdf: pdf.buffer, cmd: 'compile' },
      [pdf.buffer],
    )
  } catch {
    self.postMessage({ result: 'failed', status: -253, log: self.memlog, cmd: 'compile' })
  }
}

self.onmessage = (ev) => {
  const data = ev.data
  const cmd = data.cmd
  if (cmd === 'compilepdf') compilePDFRoutine()
  else if (cmd === 'settexliveurl') {
    let url = data.url
    if (url && !url.endsWith('/')) url += '/'
    self.texlive_endpoint = url || ''
  } else if (cmd === 'mkdir') {
    try {
      FS.mkdir(`${WORKROOT}/${data.url}`)
    } catch {}
  } else if (cmd === 'writefile') {
    try {
      FS.writeFile(`${WORKROOT}/${data.url}`, data.src)
      self.postMessage({ result: 'ok', cmd: 'writefile' })
    } catch {
      self.postMessage({ result: 'failed', cmd: 'writefile' })
    }
  } else if (cmd === 'readfile') {
    try {
      const d = FS.readFile(`${WORKROOT}/${data.url}`, { encoding: data.encoding || 'utf8' })
      self.postMessage({ result: 'ok', cmd: 'readfile', url: data.url, data: d })
    } catch {
      self.postMessage({ result: 'failed', cmd: 'readfile', url: data.url })
    }
  } else if (cmd === 'setmainfile') {
    self.mainfile = data.url
  } else if (cmd === 'flushcache') {
    cleanDir(WORKROOT)
  } else if (cmd === 'grace') {
    self.close()
  }
}

// --- kpse over HTTP against the WasmTex CDN ---------------------------------
const texlive404 = {}
const texlive200 = {}

/** Canonical extension for a kpse format (for extension-less requests). */
const FORMAT_EXT = { 4: '.afm', 26: '.tex', 32: '.pfb', 36: '.ttf', 47: '.otf' }

/** Ordered [dir, filename] candidates for the CDN request. Files WITH a known
 *  extension map to their canonical dir. Extension-LESS names are native-font
 *  lookups: XeTeX caches OpenType fonts without an extension, and from-source
 *  dvipdfmx asks for them with kpse_truetype_format(36) even when the file is an
 *  OTF — so we can't trust `format`. Try the common font containers in order
 *  (OTF first, as XeTeX native fonts usually are) until one returns 200. */
function cdnCandidates(reqname, format) {
  const lower = reqname.toLowerCase()
  if (lower.endsWith('.otf')) return [['47', reqname]]
  if (lower.endsWith('.ttf') || lower.endsWith('.ttc')) return [['36', reqname]]
  if (lower.endsWith('.pfb')) return [['32', reqname]]
  if (lower.endsWith('.afm')) return [['4', reqname]]
  if (reqname.includes('.')) return [[String(format), reqname]]
  // Extension-less + a native sfnt-font format (kpse opentype=47 / truetype=36):
  // the file may be any container — XeTeX caches OTFs without an extension and
  // from-source dvipdfmx asks for them with truetype format. Try the common
  // containers, OTF first. ONLY for 47/36: doing this for e.g. TFM(3) once fetched
  // a .pfb where a .tfm was expected ("Can't proceed..." on a size mismatch).
  if (format === 47 || format === 36) {
    return [
      ['47', `${reqname}.otf`],
      ['36', `${reqname}.ttf`],
      ['36', `${reqname}.ttc`],
      ['32', `${reqname}.pfb`],
    ]
  }
  // All other formats (TFM=3, AFM=4, ...): single canonical path.
  return [[String(format), `${reqname}${FORMAT_EXT[format] || ''}`]]
}

function kpse_find_file_impl(nameptr, format) {
  let reqname = UTF8ToString(nameptr)
  // dvipdfmx re-resolves a font by the FULL path we returned (e.g.
  // `/tex/lmroman10-regular`) to open it — strip the cache-root prefix so the
  // second lookup is a cache hit instead of being rejected by the slash guard.
  if (reqname.startsWith(`${TEXCACHEROOT}/`)) reqname = reqname.slice(TEXCACHEROOT.length + 1)
  if (reqname.includes('/')) return 0
  const cacheKey = `${format}/${reqname}`
  if (cacheKey in texlive404) return 0
  if (cacheKey in texlive200) return _allocate(intArrayFromString(texlive200[cacheKey]))

  for (const [dir, filename] of cdnCandidates(reqname, format)) {
    const url = `${self.texlive_endpoint}pdftex/${dir}/${filename}`
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url, false)
    xhr.responseType = 'arraybuffer'
    try {
      xhr.send()
    } catch {
      continue
    }
    if (xhr.status === 200) {
      const bytes = new Uint8Array(xhr.response)
      // Save at the MATCHED-extension path (e.g. /tex/lmroman10-regular.otf): for an
      // absolute, extension-less native-font name dvi_locate_native_font() bypasses
      // kpse and opens `<name>.otf`/`.ttf`/`.pfb` directly (ensuresuffix + xstrdup),
      // so the file must exist at that suffixed path. Also save at the bare requested
      // name for callers that open the kpse-returned path verbatim.
      const withExt = `${TEXCACHEROOT}/${filename}`
      const bare = `${TEXCACHEROOT}/${reqname}`
      FS.writeFile(withExt, bytes)
      if (bare !== withExt) {
        try {
          FS.writeFile(bare, bytes)
        } catch {}
      }
      texlive200[cacheKey] = withExt
      // Also key by the matched filename so a re-lookup by the returned path
      // (/tex/name.otf -> name.otf) or by the container's own format dir hits the
      // cache instead of re-fetching the same file from the CDN.
      texlive200[`${format}/${filename}`] = withExt
      texlive200[`${dir}/${filename}`] = withExt
      return _allocate(intArrayFromString(withExt))
    }
  }
  texlive404[cacheKey] = 1
  return 0
}

self.kpse_find_file_impl = kpse_find_file_impl
importScripts('wasmtex-dvipdfm.js')
