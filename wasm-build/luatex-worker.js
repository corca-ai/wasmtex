/* =============================================================================
 * luatex-worker.js — authored worker controller for the LuaTeX engine
 * =============================================================================
 *
 * Published verbatim as wasmtex-luatex.worker.js. It configures Module, owns the
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

/** Read an engine output file and post it back (PDF for compile, fmt for format).
 *  Output-file existence is the success signal: TeX exits non-zero on warnings
 *  (e.g. optional files missing) while still producing a valid PDF/format, so we
 *  report `ok` whenever the file is readable and surface the raw exit code only on
 *  failure. */
function postOutput(relPath, status) {
  try {
    const buf = FS.readFile(relPath, { encoding: 'binary' })
    self.postMessage(
      { result: 'ok', status: 0, log: self.memlog, pdf: buf.buffer, cmd: 'compile' },
      [buf.buffer],
    )
  } catch {
    self.postMessage({ result: 'failed', status: status ?? -253, log: self.memlog, cmd: 'compile' })
  }
}

function compileLaTeXRoutine() {
  prepareExecutionContext()
  cwrap('setMainEntry', 'number', ['string'])(self.mainfile)
  const status = runEngine(_compileLaTeX)
  // LuaTeX writes PDF directly — no XDV, no dvipdfmx.
  postOutput(`${WORKROOT}/${self.mainfile.replace(/\.tex$/, '')}.pdf`, status)
}

function compileFormatRoutine() {
  prepareExecutionContext()
  const status = runEngine(_compileFormat)
  postOutput(`${WORKROOT}/lualatex.fmt`, status)
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
      delete texlive404[cacheKey]
    } catch {}
    self.postMessage({ result: 'ok', cmd: 'preloadtexlive', msgId: data.msgId })
  } else if (cmd === 'preload404') {
    // Warmup: known-missing files — pre-populate the 404 cache to skip their XHR
    // (the window before the bloom filter is consulted, and a belt-and-braces).
    const entries = data.entries || []
    for (let i = 0; i < entries.length; i++) {
      const cacheKey = `${entries[i].format}/${entries[i].filename}`
      if (!(cacheKey in texlive200)) texlive404[cacheKey] = 1
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
        const buf = FS.readFile(texlive200[ck], { encoding: 'binary' })
        const copy = new Uint8Array(buf.length)
        copy.set(buf)
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
  } else if (cmd === 'grace') {
    self.close()
  }
}

// --- kpse over HTTP against the WasmTex CDN ---------------------------------
const texlive404 = {}
const texlive200 = {}

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
  if (cacheKey in texlive404) return 0
  if (cacheKey in texlive200) return _allocate(intArrayFromString(texlive200[cacheKey]))

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
  for (const cdnName of names) {
    // Bloom filter: skip the sync XHR for names the CDN definitely lacks (avoids 403
    // console noise) without blocking a name stored under a different extension.
    if (!bloomCheck(`${dir}/${cdnName}`)) continue
    const xhr = new XMLHttpRequest()
    xhr.open('GET', `${self.texlive_endpoint}pdftex/${dir}/${cdnName}`, false)
    xhr.responseType = 'arraybuffer'
    try {
      xhr.send()
    } catch {
      continue
    }
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
    return _allocate(intArrayFromString(savepath))
  }
  texlive404[cacheKey] = 1
  return 0
}

// Font-by-name goes through luaotfload + the kpse path above; the legacy
// fontconfig HTTP path is unused here.
function fontconfig_search_font_impl(_fontnamePtr, _varStringPtr) {
  return 0
}

self.kpse_find_file_impl = kpse_find_file_impl
self.fontconfig_search_font_impl = fontconfig_search_font_impl
importScripts('wasmtex-luatex.js')
