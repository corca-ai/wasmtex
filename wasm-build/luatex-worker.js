/* =============================================================================
 * luatex-worker.js — authored worker controller for the LuaTeX engine
 * =============================================================================
 *
 * Bundled after heap-snapshot.js as wasmtex-luatex.worker.js. It configures Module, owns the
 * protocol/cache policy, then imports the generated wasmtex-luatex.js core. The
 * WebAssembly itself is the GPL LuaTeX engine built from texlive-source.
 *
 * Unlike XeTeX, LuaTeX writes PDF DIRECTLY — there is no XDV and no second
 * dvipdfmx stage, so `compilelatex` returns the PDF and the whole pipeline is one
 * worker.
 *
 * It speaks the engine's message protocol (compilelatex/compileformat/...) and
 * resolves TeX Live files over HTTP against THIS project's CDN layout:
 *   ${endpoint}/pdftex/<format>/<name>           (shared with the pdfTeX mirror)
 * with the routing fixes baked in:
 *   - format dir chosen by file extension (.lua→51, .otf→47, .ttf/.ttc→36,
 *     .pfb→32, .afm→4, .tfm→3) so name-based lookups land in the right tree;
 *   - canonical extension appended for extension-less lookups (\input{x},
 *     require"luaotfload-…");
 *   - saved under the requested name (the CDN has no per-file `fileid` header).
 * ========================================================================== */

importScripts('wasmtex-luatex-resolver-evidence.js')

const TEXCACHEROOT = '/tex'
const WORKROOT = '/work'
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
Module.postRun = () => {
  const checkpoints = hcSupported()
  if (checkpoints) hcEnsureDataBuffer()
  self.postMessage({
    result: 'ok',
    heapCheckpoints: checkpoints,
    lineCheckpoints: checkpoints,
    fileCheckpoints: checkpoints,
    resumeRecorder: checkpoints,
    pagePreview: typeof _setPreviewPageLimit === 'function',
  })
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

/** Run an engine entry point. web2c engines finish by calling exit(); under
 *  emscripten that throws ExitStatus to unwind the stack, so we catch it and
 *  surface the exit code as the status (EXIT_RUNTIME=0 keeps the FS alive, so the
 *  output file written before exit is still readable). */
function runEngine(fn) {
  try {
    return fn()
  } catch (e) {
    if (e && (e.name === 'ExitStatus' || typeof e.status === 'number')) return e.status
    self.postMessage({
      cmd: 'workererror',
      errorName: e && e.name,
      errorMessage: e && e.message ? e.message : String(e),
      errorStack: e && e.stack,
      errorLog: self.memlog.slice(-8192),
    })
    throw e
  }
}

// --- Heap snapshot: restore engine state between compiles in the same worker ---
function dumpHeapMemory() {
  return self.wasmtexHeapSnapshot.capture(wasmMemory.buffer)
}
function restoreHeapMemory() {
  if (!self.initmem) return
  self.wasmtexHeapSnapshot.restore(wasmMemory.buffer, self.initmem)
}
function closeFSStreams() {
  for (let i = 0; i < FS.streams.length; i++) {
    const stream = FS.streams[i]
    if (!stream || stream.fd <= 2) continue
    FS.close(stream)
  }
}
/** Write a texmf.cnf so kpathsea has search paths (CWD + the /tex cache) and memory
 *  params. LUAINPUTS/CLUAINPUTS matter for LuaTeX's .lua runtime (luaotfload). */
function writeTexmfCnf() {
  const c = `${TEXCACHEROOT}//`
  const cnf = [
    `TEXMFCNF = .;${WORKROOT}`,
    `TEXINPUTS = .;${c}`,
    `LUAINPUTS = .;${c}`,
    `CLUAINPUTS = .;${c}`,
    `TEXFORMATS = .;${c}`,
    `TEXFONTMAPS = .;${c}`,
    `ENCFONTS = .;${c}`,
    `OPENTYPEFONTS = .;${c}`,
    `TTFONTS = .;${c}`,
    `T1FONTS = .;${c}`,
    `TFMFONTS = .;${c}`,
    `VFFONTS = .;${c}`,
    `TEXPSHEADERS = .;${c}`,
    // luaotfload reads/writes its font-names DB under here (luatex-cache/generic/names);
    // we drop a prebuilt DB there so by-name fonts resolve (see injectLuaotfloadNames).
    `TEXMFVAR = ${TEXCACHEROOT}/texmf-var`,
    `TEXMFCACHE = ${TEXCACHEROOT}/texmf-var`,
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

/** Recursive mkdir for MEMFS (FS.mkdir is single-level). */
function mkdirp(path) {
  let cur = ''
  for (const part of path.split('/')) {
    if (!part) continue
    cur += `/${part}`
    try {
      FS.mkdir(cur)
    } catch {}
  }
}

// Prebuilt luaotfload font-names DB. luaotfload can't scan font dirs in the
// on-demand WASM model, so without this a by-name font (`\setmainfont{Latin Modern
// Roman}`) silently falls back to Computer Modern. The DB records mirror fonts as
// location="texmf", so luaotfload resolves each hit via kpse → our CDN hook. Plain
// `.lua` (not `.luc`: x86_64 bytecode isn't wasm32-loadable).
//
// The DB is sourced through the normal `texlive200` cache, so it rides the existing
// infra for free: warmup prefetch (`preloadtexlive` → manifest entry, in parallel
// with worker boot) and cross-session persistence (`dumpcache`/restore). Only a
// genuine cold session with no warmup falls back to a one-time direct fetch.
const NAMES_DIR = `${TEXCACHEROOT}/texmf-var/luatex-cache/generic/names`
const NAMES_CK = '51/luaotfload-names.lua' // texlive200/dumpcache key (warmup unit)
let namesInjected = false
function injectLuaotfloadNames() {
  if (namesInjected) return // /tex persists across compiles; write once per session
  // Prefer the warmup/persistent-cache copy; else fetch once and register it in
  // texlive200 so dumpcache persists it for the next visit.
  let path = texlive200[NAMES_CK]
  if (!path && self.texlive_endpoint && !(NAMES_CK in texlive404)) {
    try {
      const xhr = new XMLHttpRequest()
      xhr.open('GET', `${self.texlive_endpoint}pdftex/51/luaotfload-names.lua`, false)
      xhr.responseType = 'arraybuffer'
      xhr.send()
      if (xhr.status === 200) {
        path = `${TEXCACHEROOT}/luaotfload-names.lua`
        FS.writeFile(path, new Uint8Array(xhr.response))
        texlive200[NAMES_CK] = path
      } else {
        texlive404[NAMES_CK] = 1
      }
    } catch {}
  }
  if (!path) return // DB not deployed → graceful fallback (by-filename only)
  try {
    mkdirp(NAMES_DIR)
    FS.writeFile(`${NAMES_DIR}/luaotfload-names.lua`, FS.readFile(path, { encoding: 'binary' }))
    namesInjected = true
  } catch {}
}

function prepareExecutionContext() {
  self.memlog = ''
  restoreHeapMemory()
  closeFSStreams()
  FS.chdir(WORKROOT)
  // kpathsea does lstat(argv[0]) to locate the program dir — provide a dummy
  // binary so SELFAUTO* resolve. Plus the config it reads at startup.
  try {
    FS.writeFile(`${WORKROOT}/luahbtex`, '')
  } catch {}
  writeTexmfCnf()
  injectLuaotfloadNames()
  // Disable luaotfload's "update-live": on a font-name MISS it would otherwise try to
  // rebuild the names DB by scanning font dirs — futile in the on-demand WASM model
  // (kpse can't list dirs) and just slow/noisy. The prebuilt DB is authoritative, so a
  // miss should fall back immediately. CWD (WORKROOT) is luaotfload's first conf search
  // location. Hits are unaffected (no rescan needed when the font is found).
  try {
    FS.writeFile(`${WORKROOT}/luaotfload.conf`, '[db]\nupdate-live = false\n')
  } catch {}
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

/** Read an engine output file and post it back (PDF for compile, fmt for format).
 *  Output-file existence is the success signal: TeX exits non-zero on warnings
 *  (e.g. optional files missing) while still producing a valid PDF/format, so we
 *  report `ok` whenever the file is readable and surface the raw exit code only on
 *  failure. */
// TeX names its outputs after the job, not after the path it was given. A run
// over `paper/main.tex` writes `main.pdf`, `main.log` and `main.synctex.gz`
// into the working directory, so an output path built from the full input path
// names a file that was never written: the compile succeeds, and the caller is
// handed no PDF. The job name is the input's base name without its extension.
function jobNameForMain(mainFile) {
  var name = mainFile.slice(mainFile.lastIndexOf('/') + 1)
  return name.replace(/\.[^.]+$/, '')
}

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
        ...hcResponseFields(),
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
      ...hcResponseFields(),
    })
  }
}

async function compileLaTeXRoutine(data = {}) {
  prepareExecutionContext()
  cwrap('setMainEntry', 'number', ['string'])(self.mainfile)
  hcArm(data.checkpoints)
  const status = hc.armed.length ? await runArmedCompile() : runEngine(_compileLaTeX)
  // LuaTeX writes PDF directly — no XDV, no dvipdfmx.
  const jobName = jobNameForMain(self.mainfile)
  postOutput(`${WORKROOT}/${jobName}.pdf`, status, jobName)
}

function compileFormatRoutine() {
  hcArm()
  prepareExecutionContext()
  const status = runEngine(_compileFormat)
  postOutput(`${WORKROOT}/lualatex.fmt`, status)
}

self.onmessage = (ev) => {
  const data = ev.data
  const cmd = data.cmd
  hcApplyBudget(data.checkpointBudget)
  if (cmd === 'compilelatex') compileLaTeXRoutine(data).catch(hcReportCrash)
  else if (cmd === 'compileheapcheckpoint') compileFromHeapCheckpointRoutine(data).catch(hcReportCrash)
  else if (cmd === 'compilepagepreview') compilePagePreviewRoutine(data).catch(hcReportCrash)
  else if (cmd === 'dropheapcheckpoints') {
    if (Array.isArray(data.ids)) for (const id of data.ids) delete hc.checkpoints[id]
    else hc.checkpoints = {}
    self.postMessage({ result: 'ok', cmd: 'dropheapcheckpoints' })
  } else if (cmd === 'compileformat') compileFormatRoutine()
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
      if (hcSupported() && !/\.fmt$/.test(data.url)) hc.hostWrites[data.url] = data.src
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
  } else if (cmd === 'loadbloom') {
    // Load the CDN bloom filter to skip sync XHR for definitely-missing files.
    loadBloom(data.data)
  } else if (cmd === 'preloadtexlive') {
    // Warmup: a file the host pre-fetched in parallel. Write it into the cache
    // so kpse finds it locally and never does a (blocking) sync XHR for it.
    // Keyed exactly like kpse_find_file_impl: cacheKey `${format}/${filename}`,
    // saved at /tex/<filename> (on the LUAINPUTS/TEXINPUTS search path).
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
    self.postMessage({ result: 'ok', cmd: 'preloadtexlive', msgId: data.msgId })
  } else if (cmd === 'preload404') {
    // Warmup: known-missing files — pre-populate the 404 cache to skip their XHR
    // (the window before the bloom filter is consulted, and a belt-and-braces).
    const entries = data.entries || []
    for (let i = 0; i < entries.length; i++) {
      const cacheKey = `${entries[i].format}/${entries[i].filename}`
      if (!(cacheKey in texlive200)) {
        texlive404[cacheKey] = 1
        texlive404Source[cacheKey] = data.source === 'durable-negative'
          ? 'durable-negative'
          : 'warmup-negative'
      }
    }
    self.postMessage({ result: 'ok', cmd: 'preload404', msgId: data.msgId })
  } else if (cmd === 'dumpcache') {
    // Export every TeX Live file fetched/preloaded this session so the host can
    // persist it (durable IndexedDB cache). Keys are `${format}/${reqname}`;
    // values are the saved paths under /tex.
    const files = []
    const transfer = []
    for (const ck in texlive200) {
      const slash = ck.indexOf('/')
      if (slash < 0) continue
      try {
        // MEMFS readFile returns an independently owned copy; transfer it directly.
        const copy = FS.readFile(texlive200[ck], { encoding: 'binary' })
        files.push({ format: parseInt(ck.slice(0, slash), 10), filename: ck.slice(slash + 1), data: copy.buffer })
        transfer.push(copy.buffer)
      } catch {}
    }
    const notFound = []
    for (const nk in texlive404) {
      const slash = nk.indexOf('/')
      if (slash < 0) continue
      notFound.push({ format: parseInt(nk.slice(0, slash), 10), filename: nk.slice(slash + 1) })
    }
    self.postMessage({ result: 'ok', cmd: 'dumpcache', msgId: data.msgId, files, notFound }, transfer)
  } else if (cmd === 'flushcache') {
    cleanDir(WORKROOT)
    hcReset()
  } else if (cmd === 'grace') {
    self.close()
  }
}

// --- kpse over HTTP against the WasmTex CDN ---------------------------------
const texlive404 = {}
const texlive200 = {}
const texlive404Source = {}
const texlive200Source = {}

// --- Bloom filter: skip sync XHR for files that definitely don't exist --------
// Binary format (shared with the pdfTeX worker / gen-bloom-filter.mjs):
//   [4B magic "BF01"][1B k][4B m big-endian][ceil(m/8)B bits]
// Keys are the CDN path "<dir>/<filename>" (e.g. "51/luaotfload-main.lua").
let bloom_bits = null
let bloom_k = 0
let bloom_m = 0

function fnv1a(str) {
  // Two 32-bit FNV-1a hashes for double hashing: h_i = (h1 + i*h2) mod m.
  let h1 = 0x811c9dc5 | 0
  let h2 = 0x01000193 | 0
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 ^ c, 0x01000193)
  }
  return [h1 >>> 0, h2 >>> 0]
}

/** true if the key MIGHT exist on the CDN, false if it DEFINITELY does not. */
function bloomCheck(key) {
  if (!bloom_bits) return true // no filter loaded → allow the XHR
  const [h1, h2] = fnv1a(key)
  for (let i = 0; i < bloom_k; i++) {
    const bit = ((h1 + Math.imul(i, h2)) >>> 0) % bloom_m
    if ((bloom_bits[bit >>> 3] & (1 << (bit & 7))) === 0) return false
  }
  return true
}

function loadBloom(arr) {
  const b = new Uint8Array(arr)
  if (b.length >= 9 && b[0] === 0x42 && b[1] === 0x46 && b[2] === 0x30 && b[3] === 0x31) {
    bloom_k = b[4]
    bloom_m = (b[5] << 24) | (b[6] << 16) | (b[7] << 8) | b[8]
    bloom_bits = b.subarray(9)
  }
}

/** Canonical extension for a kpse format (for extension-less requests). LuaTeX
 *  pulls a large Lua runtime (luaotfload, luatexbase, …) under format 51. */
const FORMAT_EXT = { 3: '.tfm', 4: '.afm', 26: '.tex', 32: '.pfb', 36: '.ttf', 47: '.otf', 51: '.lua' }

/**
 * Resolve [dir, filename] for the CDN request. Files are routed by extension so
 * name-based lookups land in the right tree (Lua scripts under 51, OTF under 47,
 * Type1 under 32, …); extension-less requests get the kpse format's canonical
 * extension appended (the CDN stores files WITH extensions).
 */
function resolveCdn(reqname, format) {
  const lower = reqname.toLowerCase()
  if (lower.endsWith('.lua')) return ['51', reqname]
  if (lower.endsWith('.otf')) return ['47', reqname]
  if (lower.endsWith('.ttf') || lower.endsWith('.ttc')) return ['36', reqname]
  if (lower.endsWith('.pfb')) return ['32', reqname]
  if (lower.endsWith('.afm')) return ['4', reqname]
  if (lower.endsWith('.tfm')) return ['3', reqname]
  if (reqname.includes('.')) return [String(format), reqname]
  return [String(format), reqname + (FORMAT_EXT[format] || '')]
}

/** kpse formats whose files the CDN stores EXTENSION-LESS, so a `name.ext` request
 *  must fall back to the bare `name` (cmr12.tfm -> cmr12, ptmb7t.vf -> ptmb7t — the
 *  SAME file). Every other format stores files under their real extension and gets
 *  NO retry: substituting a different extension is wrong and resolved geometry.cfg
 *  -> geometry.sty, loading geometry twice → recursive \input (#87). The #85 TFM fix
 *  only ever needed this bare fallback. */
const BARE_STORED_FORMATS = new Set([3, 33]) // tfm, vf

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
  // TFMs/VFs are stored extension-less, so `cmr12.tfm` 403s and a Computer Modern
  // font on the legacy TFM path fails to load ("metric data not found or bad").
  // For those formats ONLY, also try the extension-stripped name (the same file).
  // Crucially we do NOT substitute a different extension for other formats — a
  // `.cfg`/`.sty`/`.cls` request must resolve to itself or miss (#85 / #87).
  const names = [filename]
  if (BARE_STORED_FORMATS.has(format)) {
    const dot = filename.lastIndexOf('.')
    if (dot > 0) names.push(filename.slice(0, dot))
  }

  let hit = null
  let hitName = null
  const attempts = []
  for (const cdnName of names) {
    // Bloom filter: skip the sync XHR for names the CDN definitely lacks (avoids 403
    // console noise) without blocking a name stored under a different extension.
    if (!bloomCheck(`${dir}/${cdnName}`)) {
      attempts.push({ source: 'bloom-filter', outcome: 'not-found', candidate: cdnName })
      continue
    }
    const xhr = new XMLHttpRequest()
    xhr.open('GET', `${self.texlive_endpoint}pdftex/${dir}/${cdnName}`, false)
    xhr.responseType = 'arraybuffer'
    try {
      xhr.send()
    } catch {
      attempts.push({ source: 'network', outcome: 'transport-error', candidate: cdnName })
      continue
    }
    attempts.push({
      source: 'network',
      outcome: xhr.status === 200 ? 'hit' : 'not-found',
      candidate: cdnName,
      status: xhr.status,
    })
    if (xhr.status === 200) {
      hit = xhr
      hitName = cdnName
      break
    }
  }
  // Report the fetch (progress UI + warmup-manifest capture). `found` splits
  // downloads (preload) from misses (preload404); `cdnFile`/`cdnDir` are the ACTUAL
  // resolved CDN key (the retry may resolve cmr12.tfm -> cmr12) so warmup preloads
  // the URL that 200s, while `file` stays the engine's requested name (cache key).
  self.postMessage({
    cmd: 'downloading',
    file: reqname,
    cdnFile: hitName || filename,
    cdnDir: dir,
    format: format,
    found: !!hit,
  })
  if (hit) {
    // Save under the engine's requested name (e.g. cmr12.tfm) so a re-open by that
    // name hits, even though the CDN served the bare `cmr12`.
    const savepath = `${TEXCACHEROOT}/${reqname}`
    FS.writeFile(savepath, new Uint8Array(hit.response))
    texlive200[cacheKey] = savepath
    texlive200Source[cacheKey] = 'session-cache'
    delete texlive404Source[cacheKey]
    self.wasmtexResolverEvidence(reqname, format, 'resolved', attempts)
    return _allocate(intArrayFromString(savepath))
  }
  const mirrorAbsent = attempts.length > 0 && attempts.every((attempt) => attempt.outcome === 'not-found')
  if (mirrorAbsent) {
    texlive404[cacheKey] = 1
    texlive404Source[cacheKey] = attempts.some((attempt) => attempt.source === 'bloom-filter')
      ? 'bloom-filter'
      : 'network'
  }
  self.wasmtexResolverEvidence(
    reqname,
    format,
    mirrorAbsent ? 'mirror-absent' : 'transport-error',
    attempts,
  )
  return 0
}

// Font-by-name goes through luaotfload + the kpse path above; the legacy
// fontconfig HTTP path is unused here.
function fontconfig_search_font_impl(_fontnamePtr, _varStringPtr) {
  return 0
}

// --- Heap checkpoints ----------------------------------------------------------
//
// Only on the checkpoint build (`?engine=checkpoint`). Its Asyncify instrumentation
// covers just the functions on the stack while TeX reads a project line, listed by
// index in `self.wasmtexCheckpointFrames`. A read that reaches an armed line offset
// suspends TeX; the heap and the work directory at that moment form a checkpoint that
// a later compile restores any number of times, after which TeX reads the edited tail.
// A stack holding any other WebAssembly frame cannot be unwound safely, so that
// checkpoint is refused and the read goes on. Modelled on the pdfTeX controller's heap
// checkpoints; the host decides when a checkpoint is still valid.

const hc = {
  checkpoints: {}, // id -> snapshot
  armed: [], // [{id, line, path, offset, node}] sorted by offset, for the run in progress
  taken: [],
  refused: [], // [{id, reason}] where reason is 'stack' or 'budget'
  pending: null, // {wakeUp, cp} of the suspended run
  resuming: null, // {node} until a resumed run's first read finishes the rewind
  hostWrites: {}, // path -> latest content the host wrote, re-applied after a restore
  readInputs: null,
  readExtents: null,
  tracking: false,
  budget: { maxCount: 1, maxBytes: 200 * 1024 * 1024 },
  tick: 0,
  lastId: null,
  dataPtr: 0,
  hookInstalled: false,
}

function hcSupported() {
  return (
    typeof Asyncify !== 'undefined' &&
    typeof _asyncify_start_rewind === 'function' &&
    Array.isArray(self.wasmtexCheckpointFrames) &&
    self.wasmtexCheckpointFrames.length > 1
  )
}

function hcReset() {
  hc.checkpoints = {}
  hc.hostWrites = {}
  hc.lastId = null
}

function hcApplyBudget(budget) {
  if (
    budget &&
    Number.isSafeInteger(budget.maxCount) &&
    budget.maxCount >= 0 &&
    budget.maxCount <= 64 &&
    Number.isSafeInteger(budget.maxBytes) &&
    budget.maxBytes >= 0
  ) {
    hc.budget = { maxCount: budget.maxCount, maxBytes: budget.maxBytes }
  }
}

// Reserve the Asyncify data buffer before the initialization snapshot captures malloc
// state; otherwise a reset frees it behind the JS pointer and TeX can reuse it.
function hcEnsureDataBuffer() {
  if (hc.dataPtr) return
  const ptr = _malloc(12 + Asyncify.StackSize)
  hc.dataPtr = ptr
  Asyncify.allocateData = () => {
    Asyncify.setDataHeader(ptr, ptr + 12, Asyncify.StackSize)
    Asyncify.setDataRewindFunc(ptr)
    return ptr
  }
  // Resolve Emscripten's self-replacing lazy export before wrapping it.
  _free(0)
  const free = _free
  _free = (p) => (p === ptr ? undefined : free(p))
}

// Every WebAssembly frame between the read (innermost) and the entry point (outermost)
// must be instrumented, with no JavaScript frame between them. Anything unexpected,
// including a truncated or unparsable trace, refuses the checkpoint.
function hcStackInstrumented() {
  const frames = self.wasmtexCheckpointFrames
  const limit = Error.stackTraceLimit
  let stack = ''
  try {
    Error.stackTraceLimit = 256
    stack = String(new Error().stack || '')
  } catch {
    return false
  } finally {
    Error.stackTraceLimit = limit
  }
  const allowed = new Set(frames)
  const sequence = []
  for (const line of stack.split('\n')) {
    if (!line.trim() || line.trim() === 'Error') continue
    const match = /wasm-function\[(\d+)\]/.exec(line)
    sequence.push(match ? Number(match[1]) : null)
  }
  const first = sequence.findIndex((entry) => entry !== null)
  const last = sequence.findLastIndex((entry) => entry !== null)
  if (first < 0) return false
  const wasm = sequence.slice(first, last + 1)
  if (wasm.includes(null)) return false
  if (wasm[0] !== frames[0] || wasm[wasm.length - 1] !== frames[frames.length - 1]) return false
  return wasm.every((index) => allowed.has(index))
}

// Byte offset of a 1-based line, counted on the file's bytes: decoding first would
// shift it after an invalid UTF-8 sequence or a NUL.
function hcLineOffset(bytes, line) {
  let at = 0
  for (let n = 1; n < line; n++) {
    at = bytes.indexOf(10, at) + 1
    if (at === 0) return -1
  }
  return at
}

// Arm checkpoints for the run about to start: [{id, line, path?}] in host line numbers.
function hcArm(checkpoints) {
  hc.armed = []
  hc.taken = []
  hc.refused = []
  hc.readInputs = {}
  hc.readExtents = {}
  if (!checkpoints || !checkpoints.length || !hcSupported()) return
  hcInstallReadHook()
  const seen = new Set()
  const sources = {}
  for (const cp of checkpoints) {
    const relative = cp.path === undefined ? self.mainfile : cp.path
    if (
      typeof relative !== 'string' ||
      relative[0] === '/' ||
      relative.split('/').some((part) => !part || part === '.' || part === '..')
    )
      continue
    const path = `${WORKROOT}/${relative}`
    try {
      sources[path] ||= { bytes: FS.readFile(path), node: FS.lookupPath(path).node }
    } catch {
      continue
    }
    const offset = hcLineOffset(sources[path].bytes, cp.line)
    const key = `${path}:${offset}`
    if (offset < 0 || seen.has(key)) continue
    seen.add(key)
    hc.armed.push({ id: cp.id, line: cp.line, path: relative, offset, node: sources[path].node })
  }
  hc.armed.sort((a, b) => a.offset - b.offset)
}

function hcDisarm() {
  hc.armed = []
  hc.resuming = null
}

function hcInstallReadHook() {
  if (hc.hookInstalled) return
  hc.hookInstalled = true
  const read = FS.read
  FS.read = function (stream, buffer, offset, length, position) {
    // While unwinding, serve nothing: fd_read's iov loop would otherwise read on and
    // move the stream past the checkpoint.
    if (Asyncify.state === Asyncify.State.Unwinding) return 0
    if (length === 0) return read.call(FS, stream, buffer, offset, length, position)
    if (hc.tracking && stream.path) hc.readInputs[stream.path] = true
    const resuming = hc.resuming
    if (resuming && Asyncify.state === Asyncify.State.Rewinding && stream.node === resuming.node) {
      Asyncify.handleSleep(() => {})
      hc.resuming = null
    }
    const pos = position === undefined ? stream.position : position
    let index
    while ((index = hc.armed.findIndex((cp) => cp.node === stream.node)) >= 0) {
      const cp = hc.armed[index]
      if (pos < cp.offset && pos + length > cp.offset) {
        length = cp.offset - pos // stop exactly at the checkpoint
        break
      }
      if (pos === cp.offset) {
        if (Asyncify.state === Asyncify.State.Normal) {
          if (!hcStackInstrumented()) {
            hc.armed.splice(index, 1)
            hc.refused.push({ id: cp.id, reason: 'stack' })
            continue
          }
          Asyncify.handleSleep((wakeUp) => {
            hc.pending = { wakeUp, cp }
          })
          return 0
        }
        if (Asyncify.state === Asyncify.State.Rewinding) {
          Asyncify.handleSleep(() => {}) // completes the rewind
          hc.armed.splice(index, 1)
          continue
        }
      } else if (pos > cp.offset) {
        hc.armed.splice(index, 1) // already past it
        continue
      }
      break
    }
    const count = read.call(FS, stream, buffer, offset, length, position)
    if (hc.tracking && count > 0) {
      const path = FS.getPath(stream.node)
      hc.readExtents[path] = Math.max(hc.readExtents[path] || 0, pos + count)
    }
    return count
  }
}

function hcRetention() {
  const buffers = new Set()
  const ids = Object.keys(hc.checkpoints)
  for (const id of ids) {
    const checkpoint = hc.checkpoints[id]
    for (const page of checkpoint.image.pages) buffers.add(page.data)
    for (const data of Object.values(checkpoint.fs.files)) buffers.add(data)
  }
  let bytes = 0
  for (const data of buffers) bytes += data.byteLength
  return { ids, bytes }
}

function hcEnforceBudget() {
  let held = hcRetention()
  while (held.ids.length > hc.budget.maxCount || held.bytes > hc.budget.maxBytes) {
    held.ids.sort((a, b) => hc.checkpoints[a].used - hc.checkpoints[b].used)
    delete hc.checkpoints[held.ids[0]]
    held = hcRetention()
  }
}

// Offsets of nonzero 4 KiB blocks: what a sparse image would keep.
function hcNonzeroBlocks() {
  const words = new Int32Array(wasmMemory.buffer)
  const blocks = []
  for (let at = 0; at < words.length; at += 1024) {
    const end = Math.min(words.length, at + 1024)
    for (let k = at; k < end; k++) {
      if (words[k]) {
        blocks.push(at * 4)
        break
      }
    }
  }
  return blocks
}

// Sparse memory image: nonzero blocks, sharing exact bytes with retained snapshots.
function hcSparseImage(blocks) {
  const candidates = {}
  for (const checkpoint of Object.values(hc.checkpoints)) {
    for (const page of checkpoint.image.pages) (candidates[page.at] ||= []).push(page.data)
  }
  const src = new Uint8Array(wasmMemory.buffer)
  const pages = []
  for (const at of blocks) {
    const end = Math.min(src.length, at + 4096)
    const words = new Int32Array(src.buffer, at, (end - at) >> 2)
    let data = null
    for (const prior of candidates[at] || []) {
      if (prior.length !== end - at) continue
      const priorWords = new Int32Array(prior.buffer, prior.byteOffset, words.length)
      let equal = true
      for (let k = 0; k < words.length; k++) {
        if (priorWords[k] !== words[k]) {
          equal = false
          break
        }
      }
      if (equal) {
        data = prior
        break
      }
    }
    pages.push({ at, data: data || src.slice(at, end) })
  }
  return { length: src.length, pages }
}

function hcWorkFiles() {
  const files = {}
  const previous = hc.checkpoints[hc.lastId]?.fs.files ?? {}
  const walk = (dir) => {
    for (const name of FS.readdir(dir)) {
      if (name === '.' || name === '..') continue
      const path = `${dir}/${name}`
      if (FS.isDir(FS.stat(path).mode)) {
        walk(path)
        continue
      }
      if (/\.fmt$/.test(name)) continue // read before any checkpoint; multi-MB
      const node = FS.lookupPath(path).node
      const prior = previous[path]
      let same = !!prior && prior.length === node.usedBytes
      for (let k = 0; same && k < node.usedBytes; k++) same = prior[k] === node.contents[k]
      files[path] = same ? prior : node.contents ? node.contents.slice(0, node.usedBytes) : new Uint8Array(0)
    }
  }
  walk(WORKROOT)
  return files
}

function hcSnapshotStreams() {
  const streams = []
  for (let fd = 3; fd < FS.streams.length; fd++) {
    const s = FS.streams[fd]
    // A stream keeps the path it was opened with, but web2c renames the open recorder
    // to <job>.fls; reopening the old name would write a stray file.
    if (s) streams.push({ fd, path: s.node ? FS.getPath(s.node) : s.path, flags: s.flags, position: s.position })
  }
  return streams
}

// Unterminated terminal lines live in the TTY buffers, outside linear memory.
function hcTerminal() {
  return [1, 2].map((fd) => [...(FS.streams[fd]?.tty?.output ?? [])])
}

function hcRestoreTerminal(saved) {
  ;[1, 2].forEach((fd, i) => {
    const tty = FS.streams[fd]?.tty
    if (tty && saved) tty.output = [...saved[i]]
  })
}

// Empty the work directory except the formats the host installed before any run;
// later fresh compiles load them by name.
function hcClearWork() {
  closeFSStreams()
  for (const name of FS.readdir(WORKROOT)) {
    if (name === '.' || name === '..') continue
    const path = `${WORKROOT}/${name}`
    if (FS.isDir(FS.stat(path).mode)) cleanDir(path)
    else if (!/\.fmt$/.test(name)) FS.unlink(path)
  }
}

function hcRestoreFS(snap) {
  hcClearWork()
  for (const [path, data] of Object.entries(snap.files)) {
    try {
      FS.mkdirTree(path.substring(0, path.lastIndexOf('/')))
    } catch {}
    FS.writeFile(path, data)
  }
  // Open outputs belong to the suspended engine; other project files take the host's
  // latest bytes.
  const outputs = new Set(snap.streams.filter((s) => (s.flags & 3) !== 0).map((s) => s.path))
  for (const [relative, content] of Object.entries(hc.hostWrites)) {
    const full = `${WORKROOT}/${relative}`
    if (outputs.has(full)) continue
    try {
      FS.mkdirTree(full.substring(0, full.lastIndexOf('/')))
    } catch {}
    FS.writeFile(full, content)
  }
  const placeholders = []
  for (const st of snap.streams) {
    let stream = FS.open(st.path, st.flags)
    while (stream.fd < st.fd) {
      // keep fd numbering identical to the C side
      placeholders.push(stream)
      stream = FS.open(st.path, st.flags)
    }
    if (stream.fd !== st.fd) throw new Error(`heap checkpoint: fd ${stream.fd} != ${st.fd}`)
    stream.position = st.position
  }
  for (const stream of placeholders) {
    try {
      FS.close(stream)
    } catch {}
  }
}

function hcPrefixSafe(cp) {
  return (hc.readExtents[`${WORKROOT}/${cp.path}`] || 0) <= cp.offset
}

// Count first, copy second: an image over the budget is refused without being copied
// and without evicting checkpoints that fit.
function hcWorkBytes(dir = WORKROOT) {
  let bytes = 0
  for (const name of FS.readdir(dir)) {
    if (name === '.' || name === '..') continue
    const path = `${dir}/${name}`
    if (FS.isDir(FS.stat(path).mode)) bytes += hcWorkBytes(path)
    else if (!/\.fmt$/.test(name)) bytes += FS.lookupPath(path).node.usedBytes || 0
  }
  return bytes
}

function hcTakeSnapshot(cp) {
  const start = performance.now()
  const blocks = hcNonzeroBlocks()
  const bytes = blocks.length * 4096 + hcWorkBytes()
  if (hc.budget.maxCount < 1 || bytes > hc.budget.maxBytes) return { refused: 'budget', bytes }
  const files = hcWorkFiles()
  const image = hcSparseImage(blocks)
  const inputs = hc.readInputs ? Object.keys(hc.readInputs) : null
  return {
    id: cp.id,
    line: cp.line,
    offset: cp.offset,
    path: cp.path,
    readExtents: { ...hc.readExtents },
    prefixSafe: hcPrefixSafe(cp),
    image,
    currData: Asyncify.currData,
    sp: stackSave(),
    fs: { files, streams: hcSnapshotStreams() },
    memlog: self.memlog,
    terminal: hcTerminal(),
    inputs,
    inputsComplete: inputs !== null,
    bytes,
    ms: performance.now() - start,
  }
}

function hcRestoreMemory(snap) {
  const need = snap.image.length
  const have = wasmMemory.buffer.byteLength
  if (need > have) {
    wasmMemory.grow(Math.ceil((need - have) / 65536))
    updateMemoryViews()
  }
  const dst = new Uint8Array(wasmMemory.buffer)
  dst.fill(0)
  for (const page of snap.image.pages) dst.set(page.data, page.at)
  stackRestore(snap.sp)
}

// After the entry point returned: if a checkpoint suspended it, keep the state and
// continue; repeat for every armed checkpoint the run reaches.
async function hcContinueWhileSuspended(status) {
  let done = null
  while (Asyncify.currData && hc.pending) {
    const pending = hc.pending
    hc.pending = null
    const snap = hcTakeSnapshot(pending.cp)
    if (snap.refused) {
      hc.refused.push({ id: pending.cp.id, reason: snap.refused, bytes: snap.bytes })
    } else {
      snap.used = ++hc.tick
      hc.checkpoints[snap.id] = snap
      hc.lastId = snap.id
      hcEnforceBudget()
      hc.taken.push({
        id: snap.id,
        line: snap.line,
        path: snap.path === self.mainfile ? undefined : snap.path,
        prefixSafe: snap.prefixSafe,
        bytes: snap.bytes,
        ms: Math.round(snap.ms),
        inputs: snap.inputs,
        inputsComplete: snap.inputsComplete,
      })
    }
    if (!done) done = Asyncify.whenDone()
    try {
      // wakeUp runs synchronously until the next suspension or completion; waiting for
      // completion at every checkpoint would deadlock the second one.
      pending.wakeUp(0)
      if (!hc.pending) status = await done
    } catch (e) {
      if (isExitStatus(e)) status = e.status
      else throw e
    }
  }
  return status
}

function isExitStatus(e) {
  return !!e && (e.name === 'ExitStatus' || typeof e.status === 'number')
}

// A run that died mid-unwind or mid-rewind leaves Asyncify's state behind; the next
// compile on this worker must start from Normal. Retained checkpoints stay valid.
function hcResetAsyncify() {
  if (typeof Asyncify === 'undefined' || Asyncify.state === Asyncify.State.Normal) return
  try {
    if (Asyncify.state === Asyncify.State.Unwinding) _asyncify_stop_unwind()
    else _asyncify_stop_rewind()
  } catch {}
  Asyncify.state = Asyncify.State.Normal
  Asyncify.currData = null
  hc.pending = null
  hcDisarm()
}

// Every compile request gets exactly one reply. An abort already sent its own.
function hcReportCrash(e) {
  hcResetAsyncify()
  if (typeof ABORT !== 'undefined' && ABORT) return
  self.memlog += `\n[heap-checkpoint] ${e && e.stack ? e.stack : e}`
  self.postMessage({ result: 'failed', status: -254, log: self.memlog, cmd: 'compile', ...hcResponseFields() })
}

// Checkpoint fields for a compile response.
function hcResponseFields() {
  if (!hcSupported()) return {}
  const fields = { heapCheckpointRetention: hcRetention() }
  const taken = hc.taken.filter((record) => !!hc.checkpoints[record.id])
  if (taken.length) fields.heapCheckpoints = taken
  if (hc.refused.length) fields.heapCheckpointRefusals = hc.refused
  return fields
}

// The TeX run for compilelatex: armed checkpoints suspend it, the rest is synchronous.
async function runArmedCompile() {
  // Blocks above the initial snapshot keep bytes from earlier, larger runs; they would
  // count against the budget and leak into the image.
  new Uint8Array(wasmMemory.buffer).fill(0, self.initmem.byteLength)
  hc.tracking = true
  let status
  try {
    try {
      status = _compileLaTeX()
    } catch (e) {
      if (isExitStatus(e)) status = e.status
      else throw e
    }
    status = await hcContinueWhileSuspended(status)
  } finally {
    hc.tracking = false
    hcDisarm()
  }
  return status
}

// compileheapcheckpoint {id, checkpoints?}: restore a checkpoint on the project files as
// the host last wrote them and finish like a normal compile. A page preview passes
// `pageLimit`, which lives in linear memory and so is set after the restore.
async function compileFromHeapCheckpointRoutine(data, pageLimit = 0) {
  const snap = hc.checkpoints[data.id]
  const job = jobNameForMain(self.mainfile)
  if (!snap || !hcSupported()) {
    self.postMessage({ result: 'failed', status: -1, log: 'no such heap checkpoint', cmd: 'compile' })
    return
  }
  snap.used = ++hc.tick
  let status
  try {
    hcRestoreFS(snap.fs)
    hcRestoreMemory(snap)
    if (typeof _setPreviewPageLimit === 'function') _setPreviewPageLimit(pageLimit)
    self.memlog = snap.memlog
    hcRestoreTerminal(snap.terminal)
    hcArm(pageLimit ? undefined : data.checkpoints)
    for (const path of snap.inputs || []) hc.readInputs[path] = true
    hc.readExtents = { ...snap.readExtents }
    hc.armed = hc.armed.filter((cp) => cp.path !== snap.path || cp.offset > snap.offset)
    hc.resuming = { node: FS.lookupPath(`${WORKROOT}/${snap.path}`).node }
    hcInstallReadHook()
    hc.tracking = true
    Asyncify.state = Asyncify.State.Rewinding
    Asyncify.currData = snap.currData
    _asyncify_start_rewind(snap.currData)
    try {
      status = _compileLaTeX()
    } catch (e) {
      if (isExitStatus(e)) status = e.status
      else throw e
    }
    status = await hcContinueWhileSuspended(status)
  } catch (e) {
    // The restored work directory holds the checkpoint's partial PDF: never report it.
    hc.tracking = false
    hcReportCrash(e)
    return
  } finally {
    hc.tracking = false
    hcDisarm()
  }
  postOutput(`${WORKROOT}/${job}.pdf`, status, pageLimit ? undefined : job)
}

// compilepagepreview {pageLimit, id?}: a disposable prefix. The work directory is put
// back afterwards, so its auxiliary files never seed a later compile.
async function compilePagePreviewRoutine(data) {
  const limit = data.pageLimit
  if (typeof _setPreviewPageLimit !== 'function' || !Number.isSafeInteger(limit) || limit < 1 || limit > 10000) {
    self.postMessage({ result: 'failed', status: -1, log: 'unsupported page preview', cmd: 'compile' })
    return
  }
  const saved = hcWorkFiles()
  const terminal = hcTerminal()
  try {
    if (data.id) await compileFromHeapCheckpointRoutine(data, limit)
    else {
      hcArm()
      prepareExecutionContext()
      cwrap('setMainEntry', 'number', ['string'])(self.mainfile)
      _setPreviewPageLimit(limit)
      const status = runEngine(_compileLaTeX)
      postOutput(`${WORKROOT}/${jobNameForMain(self.mainfile)}.pdf`, status)
    }
  } finally {
    _setPreviewPageLimit(0)
    hcClearWork()
    for (const [path, content] of Object.entries(saved)) {
      try {
        FS.mkdirTree(path.substring(0, path.lastIndexOf('/')))
      } catch {}
      FS.writeFile(path, content)
    }
    hcRestoreTerminal(terminal)
  }
}

self.kpse_find_file_impl = kpse_find_file_impl
self.fontconfig_search_font_impl = fontconfig_search_font_impl

// The engine binary: the plain build, or the checkpoint build when the host loaded this
// worker with `?engine=checkpoint`. A self-hosted asset set may predate the checkpoint
// build; the plain engine then boots and reports no checkpoint support.
;(() => {
  let wantCheckpoint = false
  try {
    wantCheckpoint = new URLSearchParams(self.location.search).get('engine') === 'checkpoint'
  } catch {}
  if (wantCheckpoint) {
    try {
      importScripts('wasmtex-luatex-checkpoint.js')
      return
    } catch (e) {
      console.warn(`[wasmtex] checkpoint engine unavailable, loading the plain build: ${e}`)
    }
  }
  importScripts('wasmtex-luatex.js')
})()
