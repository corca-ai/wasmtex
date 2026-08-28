/* =============================================================================
 * xetex-worker.js — authored worker controller for the XeTeX engine
 * =============================================================================
 *
 * Published verbatim as wasmtex-xetex.worker.js. It configures Module, owns the
 * protocol/cache policy, then imports the generated wasmtex-xetex.js core. The
 * WebAssembly itself is the GPL XeTeX engine.
 *
 * It speaks the engine's message protocol (compilelatex/compileformat/...) and
 * resolves TeX Live files over HTTP against THIS project's CDN layout:
 *   ${endpoint}/pdftex/<format>/<name>           (shared with the pdfTeX mirror)
 * with the required routing rules built in:
 *   - format dir chosen by file extension (.otf→47, .ttf/.ttc→36, .pfb→32,
 *     .afm→4) because XeTeX's createFont always resolves with truetype format;
 *   - `.tex` appended for extension-less format-26 lookups (\input{x});
 *   - saved under the requested name (the CDN has no per-file `fileid` header).
 * ========================================================================== */

importScripts('wasmtex-resolver-evidence.js')

const TEXCACHEROOT = '/tex'
const WORKROOT = '/work'
// biome-ignore lint: emscripten populates Module
var Module = self.Module = {}
if (self.__wasmtexWasmBinary) Module.wasmBinary = self.__wasmtexWasmBinary
self.memlog = ''
self.initmem = undefined
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

// --- ICU data (#52 M4b) -------------------------------------------------------
// emscripten's -sUSE_ICU links stubdata (no converters), so XeTeX's font manager
// (ucnv_open("macintosh")) would fail with "cannot read font names". We fetch the
// real ICU data (icudt68l.dat) from the CDN — it lives with the TeX Live files, not
// baked into the wasm — and register it via set_icu_common_data (udata_setCommonData)
// BEFORE any ICU use. It can't go in preRun (the CDN endpoint isn't set until
// settexliveurl), so ensureIcuData() runs on the first compile: fetch (cached in JS
// across compiles), register, then RE-SNAPSHOT the heap so the data buffer + ICU
// registration land in initmem and survive restoreHeapMemory on later compiles.
const ICU_DATA_FILE = 'icudt68l.dat'
self.icuData = null // raw .dat bytes, cached in JS (outside the wasm heap → survives restore)
self.icuRegistered = false
function ensureIcuData() {
  if (self.icuRegistered) return // already captured in the re-snapshotted initmem
  if (!self.icuData) {
    try {
      const xhr = new XMLHttpRequest()
      xhr.open('GET', `${self.texlive_endpoint}${ICU_DATA_FILE}`, false)
      xhr.responseType = 'arraybuffer'
      xhr.send()
      if (xhr.status === 200 || xhr.status === 0) self.icuData = new Uint8Array(xhr.response)
    } catch {}
  }
  if (!self.icuData) {
    self.memlog += '[icu] data unavailable (font-by-name will fail)\n'
    return
  }
  const ptr = _malloc(self.icuData.length)
  HEAPU8.set(self.icuData, ptr)
  const err = _set_icu_common_data(ptr)
  if (err > 0) {
    self.memlog += `[icu] udata_setCommonData err=${err}\n`
    return
  }
  self.initmem = dumpHeapMemory() // re-snapshot WITH icu so it persists across compiles
  self.icuRegistered = true
}
Module.postRun = () => {
  self.postMessage({ result: 'ok' })
  self.initmem = dumpHeapMemory()
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

/** Run an engine entry point. web2c engines finish by calling exit() (TeX's
 *  do_final_end); under emscripten that throws ExitStatus to unwind the stack, so
 *  we catch it and surface the exit code as the status (EXIT_RUNTIME=0 keeps the FS
 *  alive, so the .fmt/.xdv written just before exit is still readable). */
function runEngine(fn) {
  try {
    return fn()
  } catch (e) {
    if (e && (e.name === 'ExitStatus' || typeof e.status === 'number')) return e.status
    throw e
  }
}

// --- Heap snapshot: restore engine state between compiles in the same worker ---
function dumpHeapMemory() {
  const src = wasmMemory.buffer
  const dst = new Uint8Array(src.byteLength)
  dst.set(new Uint8Array(src))
  return dst
}
function restoreHeapMemory() {
  if (self.initmem) new Uint8Array(wasmMemory.buffer).set(self.initmem)
}
function closeFSStreams() {
  for (let i = 0; i < FS.streams.length; i++) {
    const stream = FS.streams[i]
    if (!stream || stream.fd <= 2) continue
    FS.close(stream)
  }
}
/** Write a texmf.cnf so REAL libkpathsea (the from-texlive-source XeTeX build, #52)
 *  has search paths + memory params. The worker writes the same configuration for
 *  ignores this — harmless either way. */
function writeTexmfCnf() {
  const c = `${TEXCACHEROOT}//`
  const cnf = [
    `TEXMFCNF = .;${WORKROOT}`,
    `TEXINPUTS = .;${c}`,
    `TEXFORMATS = .;${c}`,
    `TEXFONTMAPS = .;${c}`,
    `ENCFONTS = .;${c}`,
    `OPENTYPEFONTS = .;${c}`,
    `TTFONTS = .;${c}`,
    `T1FONTS = .;${c}`,
    `TFMFONTS = .;${c}`,
    `VFFONTS = .;${c}`,
    `TEXPSHEADERS = .;${c}`,
    'main_memory = 12000000',
    'font_mem_size = 8000000',
    'pool_size = 10000000',
    'buf_size = 5000000',
    'hash_extra = 2000000',
    'save_size = 200000',
    'stack_size = 50000',
    'trie_size = 1500000',
    'hyph_size = 32767',
    'max_strings = 1000000',
    'nest_size = 2000',
    'param_size = 20000',
    '',
  ].join('\n')
  FS.writeFile(`${WORKROOT}/texmf.cnf`, cnf)
}

function prepareExecutionContext() {
  self.memlog = ''
  restoreHeapMemory()
  ensureIcuData() // first compile: fetch+register ICU data + re-snapshot; then a no-op
  closeFSStreams()
  FS.chdir(WORKROOT)
  // Real libkpathsea derives the program dir from argv[0] (no /proc/self/exe under
  // WASM); a dummy absolute binary lets SELFAUTO* resolve to /work + find texmf.cnf.
  try {
    FS.writeFile(`${WORKROOT}/xetex`, '')
  } catch {}
  writeTexmfCnf()
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

function readRecorderInputs(jobName) {
  const path = `${WORKROOT}/${jobName}.fls`
  let inputs = null
  try {
    const data = FS.readFile(path, { encoding: 'utf8' })
    if (data) {
      inputs = [
        ...new Set(
          data
            .trimEnd()
            .split('\n')
            .filter((line) => line.startsWith('INPUT '))
            .map((line) => line.slice(6)),
        ),
      ]
    }
  } catch {}
  try {
    FS.unlink(path)
  } catch {}
  return inputs
}

/** Read an engine output file and post it back (xdv for compile, fmt for format).
 *  `status` is the engine exit code; if the output file is missing we surface it. */
function postOutput(relPath, status, recorderJobName) {
  const inputFiles = recorderJobName ? readRecorderInputs(recorderJobName) : undefined
  try {
    const buf = FS.readFile(relPath, { encoding: 'binary' })
    self.postMessage(
      {
        result: 'ok',
        status: 0,
        log: self.memlog,
        pdf: buf.buffer,
        cmd: 'compile',
        inputFiles,
        inputFilesComplete: recorderJobName ? inputFiles !== null : undefined,
      },
      [buf.buffer],
    )
  } catch {
    self.postMessage({
      result: 'failed',
      status: status ?? -253,
      log: self.memlog,
      cmd: 'compile',
      inputFiles,
      inputFilesComplete: false,
    })
  }
}

function compileLaTeXRoutine() {
  prepareExecutionContext()
  cwrap('setMainEntry', 'number', ['string'])(self.mainfile)
  const status = runEngine(_compileLaTeX)
  const jobName = self.mainfile.replace(/\.tex$/, '')
  postOutput(`${WORKROOT}/${jobName}.xdv`, status, jobName)
}

function compileFormatRoutine() {
  prepareExecutionContext()
  const status = runEngine(_compileFormat)
  postOutput(`${WORKROOT}/xelatex.fmt`, status)
}

self.onmessage = (ev) => {
  const data = ev.data
  const cmd = data.cmd
  if (cmd === 'compilelatex') compileLaTeXRoutine()
  else if (cmd === 'compileformat') compileFormatRoutine()
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
  } else if (cmd === 'preloadtexlive') {
    try {
      const savepath = `${TEXCACHEROOT}/${data.filename}`
      FS.writeFile(savepath, new Uint8Array(data.data))
      const cacheKey = `${data.format}/${data.filename}`
      texlive200[cacheKey] = savepath
      texlive200Source[cacheKey] = data.source === 'persistent-cache'
        ? 'persistent-cache'
        : 'warmup-cache'
      delete texlive404[cacheKey]
      delete texlive404Source[cacheKey]
    } catch {}
  } else if (cmd === 'preload404') {
    for (const entry of data.entries || []) {
      const cacheKey = `${entry.format}/${entry.filename}`
      if (!(cacheKey in texlive200)) {
        texlive404[cacheKey] = 1
        texlive404Source[cacheKey] = data.source === 'durable-negative'
          ? 'durable-negative'
          : 'warmup-negative'
      }
    }
  } else if (cmd === 'dumpcache') {
    const files = []
    const transfer = []
    for (const key in texlive200) {
      const slash = key.indexOf('/')
      if (slash < 0) continue
      try {
        const bytes = FS.readFile(texlive200[key], { encoding: 'binary' })
        const copy = new Uint8Array(bytes.length)
        copy.set(bytes)
        files.push({ format: Number(key.slice(0, slash)), filename: key.slice(slash + 1), data: copy.buffer })
        transfer.push(copy.buffer)
      } catch {}
    }
    const notFound = Object.keys(texlive404).map((key) => {
      const slash = key.indexOf('/')
      return { format: Number(key.slice(0, slash)), filename: key.slice(slash + 1) }
    })
    self.postMessage({ result: 'ok', cmd: 'dumpcache', files, notFound }, transfer)
  } else if (cmd === 'flushcache') {
    cleanDir(WORKROOT)
  } else if (cmd === 'grace') {
    self.close()
  }
}

// --- kpse over HTTP against the WasmTex CDN ---------------------------------
const texlive404 = {}
const texlive200 = {}
const texlive404Source = {}
const texlive200Source = {}

/** Canonical extension for a kpse format (for extension-less requests). */
const FORMAT_EXT = { 4: '.afm', 26: '.tex', 32: '.pfb', 36: '.ttf', 47: '.otf' }

/**
 * Resolve [dir, filename] for the CDN request. Fonts are routed by extension
 * (XeTeX's createFont always resolves with the truetype format, but our OTF live
 * under 47, Type1 under 32); extension-less requests get the kpse format's
 * canonical extension appended (the CDN stores files WITH extensions).
 */
function resolveCdn(reqname, format) {
  const lower = reqname.toLowerCase()
  if (lower.endsWith('.otf')) return ['47', reqname]
  if (lower.endsWith('.ttf') || lower.endsWith('.ttc')) return ['36', reqname]
  if (lower.endsWith('.pfb')) return ['32', reqname]
  if (lower.endsWith('.afm')) return ['4', reqname]
  if (reqname.includes('.')) return [String(format), reqname]
  return [String(format), reqname + (FORMAT_EXT[format] || '')]
}

function kpse_find_file_impl(nameptr, format, _mustexist) {
  const reqname = UTF8ToString(nameptr)
  if (reqname.includes('/')) return 0
  const cacheKey = `${format}/${reqname}`
  if (cacheKey in texlive404) {
    self.wasmtexResolverEvidence(reqname, format, 'mirror-absent', [{
      source: texlive404Source[cacheKey] || 'durable-negative', outcome: 'not-found',
    }])
    return 0
  }
  if (cacheKey in texlive200) {
    self.wasmtexResolverEvidence(reqname, format, 'resolved', [{
      source: texlive200Source[cacheKey] || 'session-cache', outcome: 'hit',
    }])
    return _allocate(intArrayFromString(texlive200[cacheKey]))
  }

  const [dir, filename] = resolveCdn(reqname, format)
  const url = `${self.texlive_endpoint}pdftex/${dir}/${filename}`
  const xhr = new XMLHttpRequest()
  xhr.open('GET', url, false)
  xhr.responseType = 'arraybuffer'
  try {
    xhr.send()
  } catch {
    self.wasmtexResolverEvidence(reqname, format, 'transport-error', [{
      source: 'network', outcome: 'transport-error', candidate: filename,
    }])
    return 0
  }
  if (xhr.status === 200) {
    const savepath = `${TEXCACHEROOT}/${reqname}`
    FS.writeFile(savepath, new Uint8Array(xhr.response))
    texlive200[cacheKey] = savepath
    texlive200Source[cacheKey] = 'session-cache'
    self.postMessage({ cmd: 'downloading', file: reqname })
    self.wasmtexResolverEvidence(reqname, format, 'resolved', [{
      source: 'network', outcome: 'hit', candidate: filename, status: xhr.status,
    }])
    return _allocate(intArrayFromString(savepath))
  }
  texlive404[cacheKey] = 1
  texlive404Source[cacheKey] = 'network'
  self.wasmtexResolverEvidence(reqname, format, 'mirror-absent', [{
    source: 'network', outcome: 'not-found', candidate: filename, status: xhr.status,
  }])
  return 0
}

// Font-by-name goes through the C font manager + xetexfontlist.txt + kpse above;
// the legacy fontconfig HTTP path is unused here.
function fontconfig_search_font_impl(_fontnamePtr, _varStringPtr) {
  return 0
}

self.kpse_find_file_impl = kpse_find_file_impl
self.fontconfig_search_font_impl = fontconfig_search_font_impl
importScripts('wasmtex-xetex.js')
