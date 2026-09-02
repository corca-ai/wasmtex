// =============================================================================
// pdftex-worker.js — authored Web Worker controller for pdfTeX WASM with SyncTeX
// =============================================================================
//
// This authored worker controller loads the generated Emscripten module at the
// bottom of the file. Keeping the two files separate makes the protocol and
// cache policy reviewable without editing generated code.
//
// The protocol uses postMessage with a {cmd, ...} object. Supported commands:
//   compilelatex   — compile the current .tex file, return PDF + SyncTeX
//   compileformat  — compile a format file (.fmt)
//   writefile      — write a file to the virtual filesystem
//   readfile       — read a file from the virtual filesystem
//   mkdir          — create a directory in the virtual filesystem
//   setmainfile    — set the main .tex entry point
//   settexliveurl  — set the TexLive package server endpoint
//   preloadtexlive — pre-load a texlive file into MEMFS cache
//   flushcache     — clear the working directory
//   grace          — gracefully shut down the worker
//
// After compilation, this worker reads the .synctex file from the WASM
//   virtual filesystem and includes it in the compile response message.
//   The engine is invoked with -synctex=1 to enable SyncTeX output.
//
// =============================================================================

importScripts('wasmtex-pdftex-resolver-evidence.js');

// --- Constants ---------------------------------------------------------------

var TEXCACHEROOT = "/tex";  // Cache for downloaded TexLive packages
var WORKROOT = "/work";     // Working directory for compilation

// Semantic trace hooks: written to __strace.tex file, then \input'd right after
// \begin{document} in the source. Runs after all \AtBeginDocument hooks, capturing
// the FINAL definitions of \label/\ref/etc (post-hyperref and other packages).
// Uses \makeatletter for @ in names; avoids _ (catcode 8 in standard LaTeX).
var SEMANTIC_TRACE_TEX = [
    "\\makeatletter",
    "\\newwrite\\st@trace",
    "\\immediate\\openout\\st@trace=\\jobname.trace\\relax",
    "\\let\\st@orig@label\\label",
    "\\renewcommand{\\label}[1]{\\immediate\\write\\st@trace{L:#1}\\st@orig@label{#1}}%",
    "\\let\\st@orig@ref\\ref",
    "\\renewcommand{\\ref}[1]{\\immediate\\write\\st@trace{R:#1}\\st@orig@ref{#1}}%",
    "\\let\\st@orig@pageref\\pageref",
    "\\renewcommand{\\pageref}[1]{\\immediate\\write\\st@trace{R:#1}\\st@orig@pageref{#1}}%",
    "\\@ifundefined{eqref}{}{%",
    "  \\let\\st@orig@eqref\\eqref",
    "  \\renewcommand{\\eqref}[1]{\\immediate\\write\\st@trace{R:#1}\\st@orig@eqref{#1}}%",
    "}%",
    "\\makeatother",
    ""
].join("\n");

// --- Worker state ------------------------------------------------------------

self.memlog = "";                // Captured stdout/stderr from pdfTeX
self.initmem = undefined;        // Snapshot of WASM heap after initialization
self.mainfile = "main.tex";      // Main .tex file to compile
self.texlive_endpoint = "";      // TexLive package server URL (set by host)

// --- Emscripten Module configuration -----------------------------------------
//
// This object is picked up by the Emscripten-generated code that follows
// this file (appended by emcc). It configures the WASM runtime before it
// starts loading.

var Module = self.Module = {};
if (self.__wasmtexWasmBinary) Module["wasmBinary"] = self.__wasmtexWasmBinary;

// Capture pdfTeX's stdout/stderr into self.memlog so we can return the
// compilation log to the host.
Module["print"] = function(a) {
    self.memlog += a + "\n";
};

Module["printErr"] = function(a) {
    self.memlog += a + "\n";
};

// Create the virtual filesystem directories before the WASM module starts.
Module["preRun"] = function() {
    FS.mkdir(TEXCACHEROOT);
    FS.mkdir(WORKROOT);
};

// After WASM initialization completes, snapshot the heap memory and notify
// the host that the engine is ready.
Module["postRun"] = function() {
    self.postMessage({ "result": "ok", "heapCheckpoints": hcSupported() });
    self.initmem = dumpHeapMemory();
};

// If the WASM engine crashes (abort), report failure to the host.
Module["onAbort"] = function() {
    self.memlog += "Engine crashed";
    self.postMessage({
        "result": "failed",
        "status": -254,
        "log": self.memlog,
        "cmd": "compile"
    });
    return;
};

// --- Heap memory management --------------------------------------------------
//
// pdfTeX modifies global state during compilation. To allow multiple
// compilations in the same worker, we snapshot the WASM heap after
// initialization and restore it before each compilation. This is much
// faster than re-initializing the entire WASM module.

function dumpHeapMemory() {
    var started = performance.now();
    var src = wasmMemory.buffer;
    var dst = new Uint8Array(src.byteLength);
    dst.set(new Uint8Array(src));
    self._heapSnapshotMs = performance.now() - started;
    return dst;
}

function restoreHeapMemory() {
    var started = performance.now();
    if (self.initmem === undefined) {
        console.error("Cannot restore heap: no snapshot taken");
        return 0;
    }
    var dst = new Uint8Array(wasmMemory.buffer);
    dst.set(self.initmem);
    // Zero out any memory beyond the initial snapshot.
    // memory.grow() during compilation expands the heap but restoreHeapMemory
    // only copies back the initial region — the grown pages retain stale data
    // from the previous compilation (TeX hash entries, macro definitions, input
    // stack frames). This causes "Command already defined" / "Can be used only
    // in preamble" / "text input levels exceeded" on subsequent compiles.
    if (dst.length > self.initmem.length) {
        dst.fill(0, self.initmem.length);
    }
    return performance.now() - started;
}

// --- Virtual filesystem helpers ----------------------------------------------

// Close any open file streams in Emscripten's FS. This prevents "too many
// open files" errors across multiple compilations.
function closeFSStreams() {
    // Start at fd 3 — skip stdin (0), stdout (1), stderr (2).
    // Closing stdout/stderr breaks all pdfTeX output: C-side FILE structs
    // (restored by restoreHeapMemory) expect these fds to be open, but
    // JS-side FS.streams would be null → fd_write fails silently → exit(1).
    for (var i = 3; i < FS.streams.length; i++) {
        var stream = FS.streams[i];
        if (!stream) continue;
        try {
            FS.close(stream);
        } catch(e) {
            // Ignore errors closing already-closed streams
        }
    }
}

// Recursively remove all files and subdirectories under a directory.
// Used by flushcache to reset the working directory between compilations.
function cleanDir(dir) {
    var l = FS.readdir(dir);
    for (var i in l) {
        var item = l[i];
        if (item === "." || item === "..") continue;
        item = dir + "/" + item;

        var fsStat = undefined;
        try {
            fsStat = FS.stat(item);
        } catch(err) {
            console.error("Not able to fsstat " + item);
            continue;
        }

        if (FS.isDir(fsStat.mode)) {
            cleanDir(item);
        } else {
            try {
                FS.unlink(item);
            } catch(err) {
                console.error("Not able to unlink " + item);
            }
        }
    }

    // Remove the directory itself (unless it's a root dir)
    if (dir !== WORKROOT && dir !== TEXCACHEROOT) {
        try {
            FS.rmdir(dir);
        } catch(err) {
            console.error("Not able to rmdir " + dir);
        }
    }
}

// --- Execution context -------------------------------------------------------

// Prepare for a compilation by resetting the log, restoring the heap to its
// initial state, closing stale file streams, and changing to the working dir.
function prepareExecutionContext() {
    self.memlog = "";
    var restoreMs = restoreHeapMemory();
    if (self._activePhaseTimings) self._activePhaseTimings.heapRestoreMs += restoreMs;
    closeFSStreams();
    FS.chdir(WORKROOT);
}

// --- DRY helpers -------------------------------------------------------------

// Write texmf.cnf so kpathsea can find fonts/styles and has enough memory.
function writeTexmfCnf() {
    var texmfCnf = [
        "% texmf.cnf for WASM pdfTeX — matches TeX Live 2025 defaults",
        "% Path configuration — kpathsea needs these to find files in CWD",
        "TEXINPUTS = .;" + TEXCACHEROOT + "//",
        "TFMFONTS = .;" + TEXCACHEROOT + "//",
        "T1FONTS = .;" + TEXCACHEROOT + "//",
        "AFMFONTS = .;" + TEXCACHEROOT + "//",
        "TEXFONTMAPS = .;" + TEXCACHEROOT + "//",
        "ENCFONTS = .;" + TEXCACHEROOT + "//",
        "VFFONTS = .;" + TEXCACHEROOT + "//",
        "TEXFORMATS = .;" + TEXCACHEROOT + "//",
        "TEXPOOL = .;" + TEXCACHEROOT + "//",
        "% Memory parameters (Maximized for TeX Live 2025 Format Building)",
        "main_memory = 12000000",
        "extra_mem_top = 10000000",
        "extra_mem_bot = 10000000",
        "font_mem_size = 8000000",
        "pool_size = 10000000",
        "buf_size = 5000000",
        "hash_extra = 2000000",
        "save_size = 200000",
        "stack_size = 50000",
        "trie_size = 1500000",
        "hyph_size = 32767",
        "max_strings = 1000000",
        "string_vacancies = 200000",
        "nest_size = 2000",
        "param_size = 20000",
        ""
    ].join("\n");
    FS.writeFile(WORKROOT + "/texmf.cnf", texmfCnf);
}

// Run _main() directly, bypassing Emscripten's callMain().
// CRITICAL: We must NOT use Emscripten's callMain because it calls exitJS()
// which invokes exitRuntime(), setting runtimeExited=true. This flag is
// JavaScript-side state that prepareExecutionContext() does NOT restore
// (it only restores WASM heap memory). Subsequent calls then fail because
// the Emscripten runtime thinks it's already shut down.
//
// Instead, we call _main() directly and catch ExitStatus ourselves — exactly
// like the original base format build code on the main branch.
//
// args should NOT include the program name — it's prepended automatically.
// IMPORTANT: Do NOT name this function "callMain" — that would shadow
// Emscripten's version and break its internal uses.
function runMain(programName, args) {
    var savedProgram = thisProgram;
    thisProgram = "./" + programName;

    // Build argv: [programName, ...args, NULL]
    var fullArgs = [programName].concat(args);
    var argPtrs = fullArgs.map(allocateString);
    argPtrs.push(0); // NULL terminator
    var argv = _malloc(argPtrs.length * 4);
    var dv = new DataView(wasmMemory.buffer);
    for (var i = 0; i < argPtrs.length; i++) {
        dv.setUint32(argv + i * 4, argPtrs[i], true);
    }

    var status;
    try {
        status = _main(fullArgs.length, argv);
    } catch(e) {
        if (e instanceof ExitStatus) {
            status = e.status;
        } else {
            _free(argv);
            thisProgram = savedProgram;
            throw e;
        }
    }
    _free(argv);
    thisProgram = savedProgram;
    return status;
}

// Read every INPUT entry from a recorder file. Keep the raw path so the host can
// distinguish /work project files from /tex/system files and normalize against
// its authoritative project VFS. Filtering by extension here would silently lose
// \includegraphics, \input-ed data, and project-local fonts.
function readRecorderInputs(jobName) {
    var flsPath = WORKROOT + "/" + jobName + ".fls";
    var inputs = null;
    try {
        var flsData = FS.readFile(flsPath, { encoding: "utf8" });
        if (flsData) {
            inputs = flsData.trimEnd().split("\n")
                .filter(function(line) { return line.startsWith("INPUT "); })
                .map(function(line) { return line.slice(6); });
            inputs = Array.from(new Set(inputs));
        }
    } catch(e) {}
    try { FS.unlink(flsPath); } catch(e) {}
    return inputs;
}

function mergeRecorderInputs(first, second) {
    if (first === null || second === null) return null;
    return Array.from(new Set(first.concat(second)));
}

function recorderProjectPath(raw) {
    var path = raw;
    if (path.startsWith(WORKROOT + "/")) path = path.slice(WORKROOT.length + 1);
    else if (path.startsWith("/")) return null;
    var parts = [];
    path.split("/").forEach(function(part) {
        if (!part || part === ".") return;
        if (part === "..") parts.pop();
        else parts.push(part);
    });
    return parts.join("/");
}

function invalidatePreambleForWrite(filename) {
    if (!self._preambleInputFiles) return;
    var projectPath = recorderProjectPath(filename);
    var dependedOn = self._preambleInputFiles.some(function(raw) {
        return recorderProjectPath(raw) === projectPath;
    });
    if (!dependedOn) return;
    self._preambleFmtData = null;
    self._preambleInputFiles = null;
    self._preambleHash = "";
}

// --- Preamble snapshot -------------------------------------------------------

self._preambleHash = "";
self._preambleFmtData = null;
self._preambleInputFiles = null;
self._fmtIsNative = false;    // true only when base format was built by our WASM binary
self._preambleSnapshotEnabled = true;  // host opt-out: false forces full compiles

// Split TeX source into preamble (before \begin{document}) and body (including it).
function extractPreamble(texSource) {
    var marker = "\\begin{document}";
    var searchFrom = 0;
    while (true) {
        var idx = texSource.indexOf(marker, searchFrom);
        if (idx === -1) return null;
        // Skip if \begin{document} is inside a comment
        var lineStart = texSource.lastIndexOf("\n", idx - 1) + 1;
        if (texSource.substring(lineStart, idx).indexOf("%") >= 0) {
            searchFrom = idx + marker.length;
            continue;
        }
        return {
            preamble: texSource.substring(0, idx),
            body: texSource.substring(idx),
            preambleLineCount: texSource.substring(0, idx).split("\n").length
        };
    }
}

// Simple string hash (djb2 variant). Returns a base-36 string.
function simpleHash(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h = h | 0;
    }
    return h.toString(36);
}

// Build a format file from the preamble text (everything before \begin{document}).
// Returns the format binary (Uint8Array) on success, null on failure.
function buildPreambleFormat(preambleText) {
    prepareExecutionContext();
    writeTexmfCnf();
    try { FS.writeFile(WORKROOT + "/pdflatex", ""); } catch(e) {}
    self._preambleInputFiles = null;

    // Base format must be available for -ini "&pdflatex"
    if (self._fmtData) {
        FS.writeFile(TEXCACHEROOT + "/pdflatex.fmt", self._fmtData);
        texlive200_cache["10/pdflatex.fmt"] = TEXCACHEROOT + "/pdflatex.fmt";
        FS.writeFile(WORKROOT + "/pdflatex.fmt", self._fmtData);
    }

    // preamble + \dump (no \begin{document})
    FS.writeFile(WORKROOT + "/_preamble.tex", preambleText + "\\dump\n");

    var status = runMain("pdflatex", ["-ini", "-interaction=nonstopmode",
                                       "-recorder", "&pdflatex", "_preamble.tex"]);
    self._preambleInputFiles = readRecorderInputs("_preamble");

    if (status === 0) {
        // Check build log for errors that indicate a broken format
        if (self.memlog.includes("Fatal format file error") ||
            self.memlog.includes("I can\\'t go on")) {
            return null;
        }
        try {
            var fmt = FS.readFile(WORKROOT + "/_preamble.fmt", { encoding: "binary" });
            if (self._fmtData && fmt.length < self._fmtData.length * 0.5) {
                return null;
            }
            return fmt;
        } catch(e) { return null; }
    }
    return null;
}

// --- TexLive package fetching ------------------------------------------------
//
// When pdfTeX needs a file (font, style, etc.) that isn't in the virtual
// filesystem, kpathsea calls kpse_find_file_impl. This function fetches
// the file from the TexLive server via synchronous XHR and caches it.
//
// The caching uses two maps:
//   texlive200_cache: maps format/filename to the saved path (for hits)
//   texlive404_cache: maps format/filename to 1 (for misses)
//
// Cache entries persist across compilations. The 404 cache prevents
// repeated requests for files that don't exist on the server.

// Allocate a C-style null-terminated string on the WASM heap.
// Replaces deprecated allocate(intArrayFromString(...), "i8", ALLOC_NORMAL).
function allocateString(str) {
    var len = lengthBytesUTF8(str) + 1;
    var ptr = _malloc(len);
    stringToUTF8(str, ptr, len);
    return ptr;
}

var texlive404_cache = {};
var texlive200_cache = {};
var texlive404_source = {};
var texlive200_source = {};

// --- Bloom filter for CDN existence checks -----------------------------------
//
// When loaded, the bloom filter lets us skip sync XHR for files that definitely
// don't exist on the CDN. This eliminates 403 errors in the browser console
// (which JS cannot suppress). False positives (bloom says YES but file missing)
// are harmless — the XHR will fail and the 404 cache catches it as before.
//
// Binary format: [4B magic "BF01"] [1B k] [4B m big-endian] [ceil(m/8)B bits]
// Hash: FNV-1a based double hashing: h_i = (h1 + i * h2) mod m

var bloom_bits = null;  // Uint8Array of the bit array
var bloom_k = 0;        // number of hash functions
var bloom_m = 0;        // number of bits

function fnv1a(str) {
    // Returns two 32-bit hashes as [h1, h2] for double hashing.
    // h1 = FNV-1a with standard offset basis
    // h2 = FNV-1a with different offset basis
    var h1 = 0x811c9dc5 | 0;
    var h2 = 0x01000193 | 0;  // different seed for second hash
    for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        h1 = h1 ^ c;
        h1 = Math.imul(h1, 0x01000193);
        h2 = h2 ^ c;
        h2 = Math.imul(h2, 0x01000193);
    }
    return [h1 >>> 0, h2 >>> 0];
}

function bloomCheck(key) {
    // Returns true if the key MIGHT exist, false if it DEFINITELY does not.
    if (!bloom_bits) return true;  // no bloom filter loaded → allow XHR
    var hashes = fnv1a(key);
    var h1 = hashes[0];
    var h2 = hashes[1];
    for (var i = 0; i < bloom_k; i++) {
        var bit = (h1 + Math.imul(i, h2)) >>> 0;
        bit = bit % bloom_m;
        var byteIdx = bit >>> 3;
        var bitIdx = bit & 7;
        if ((bloom_bits[byteIdx] & (1 << bitIdx)) === 0) {
            return false;
        }
    }
    return true;
}

// retryExtensions and bloomCandidates are defined in kpse-resolve.js, prepended
// before the generated module loads. bloomMaybe skips the XHR only when none of the bucket keys the
// fallback could fetch is in the bloom — see kpse-resolve.js for why request
// and stored names differ by extension.
function bloomMaybe(format, reqname) {
    var keys = bloomCandidates(format, reqname);
    for (var i = 0; i < keys.length; i++) {
        if (bloomCheck(keys[i])) return true;
    }
    return false;
}

// On-disk name inside the flat TEXCACHEROOT for a fetched or preloaded file.
// Ensures standard extensions for known formats so same-named files of
// different formats (TFM vs VF, BibTeX .bib vs .bst) never share a path.
function cacheFileName(format, name) {
    if (format === 3 && !name.endsWith(".tfm")) return name + ".tfm";
    if (format === 6 && !name.endsWith(".bib")) return name + ".bib";
    if (format === 7 && !name.endsWith(".bst")) return name + ".bst";
    if (format === 10 && !name.endsWith(".fmt")) return name + ".fmt";
    return name;
}

function kpse_find_file_impl(nameptr, format, _mustexist) {
    var reqname = UTF8ToString(nameptr);
    
    // Strip leading '*' or '&' — INITEX/fmt loader prefixes.
    if (reqname.startsWith("*") || reqname.startsWith("&")) {
        reqname = reqname.substring(1);
    }

    // Only fetch bare filenames, not paths
    if (reqname.includes("/")) {
        return 0;
    }

    var cacheKey = format + "/" + reqname;

    // Check caches first
    if (cacheKey in texlive404_cache) {
        self.wasmtexResolverEvidence(reqname, format, "mirror-absent", [{
            "source": texlive404_source[cacheKey] || "durable-negative",
            "outcome": "not-found"
        }]);
        return 0;
    }
    if (cacheKey in texlive200_cache) {
        var savepath = texlive200_cache[cacheKey];
        self.wasmtexResolverEvidence(reqname, format, "resolved", [{
            "source": texlive200_source[cacheKey] || "session-cache",
            "outcome": "hit"
        }]);
        return allocateString(savepath);
    }

    // Bloom filter check: if no name the fallback could resolve is on the CDN,
    // skip the XHR entirely. This prevents 403 errors in the browser console
    // that JS cannot suppress, without blocking files the bucket stores under a
    // different extension than kpathsea requested (see bloomMaybe).
    if (!bloomMaybe(format, reqname)) {
        texlive404_cache[cacheKey] = 1;
        texlive404_source[cacheKey] = "bloom-filter";
        self.wasmtexResolverEvidence(reqname, format, "mirror-absent", [{
            "source": "bloom-filter", "outcome": "not-found"
        }]);
        return 0;
    }

    var resolverAttempts = [];
    // Helper for actual fetch
    function tryFetch(name) {
        // Notify host about the download
        self.postMessage({ "cmd": "downloading", "file": name });
        
        var url = self.texlive_endpoint + "pdftex/" + format + "/" + name;
        var xhr = new XMLHttpRequest();
        xhr.open("GET", url, false);
        xhr.timeout = 150000;
        xhr.responseType = "arraybuffer";
        try {
            xhr.send();
            resolverAttempts.push({
                "source": "network",
                "outcome": xhr.status === 200 ? "hit" : "not-found",
                "candidate": name,
                "status": xhr.status
            });
            return xhr;
        } catch(err) {
            resolverAttempts.push({
                "source": "network", "outcome": "transport-error", "candidate": name
            });
            return null;
        }
    }

    var xhr = tryFetch(reqname);

    // If the request failed (some object stores return 403, not 404, for missing keys),
    // be smart about extensions.
    if (xhr && xhr.status >= 400) {
        // Case 1: Request had extension, try without it
        if (reqname.includes(".")) {
            var bare = reqname.substring(0, reqname.lastIndexOf("."));
            var retryXhr = tryFetch(bare);
            if (retryXhr && retryXhr.status === 200) {
                xhr = retryXhr;
                reqname = bare;
            }
        }
        
        // Case 2: Request didn't have extension (or Case 1 failed), try common ones
        if (xhr.status >= 400) {
            var exts = retryExtensions(format);

            for (var i = 0; i < exts.length; i++) {
                if (reqname.endsWith(exts[i])) continue;
                var retryXhr = tryFetch(reqname + exts[i]);
                if (retryXhr && retryXhr.status === 200) {
                    xhr = retryXhr;
                    reqname += exts[i];
                    break;
                }
            }
        }
    }

    if (xhr && xhr.status === 200) {
        var arraybuffer = xhr.response;
        // fileid header comes from texlive server; static hosting won't have it
        var fileid = xhr.getResponseHeader("fileid") || reqname;
        var savepath = TEXCACHEROOT + "/" + cacheFileName(format, fileid);
        var data = new Uint8Array(arraybuffer);
        FS.writeFile(savepath, data);

        // For format files (type 10), also write to working directory.
        // pdfTeX's open_fmt_file uses fopen() directly on the name from
        // pack_buffered_name — it does NOT use kpse_find_file's return path.
        // So the file must exist where fopen() looks: the working directory.
        if (format === 10) {
            var wdpath = WORKROOT + "/" + reqname;
            FS.writeFile(wdpath, data);
            // console.log("[kpse] Format file also written to " + wdpath);
        }

        texlive200_cache[cacheKey] = savepath;
        texlive200_source[cacheKey] = "session-cache";
        delete texlive404_source[cacheKey];
        self.wasmtexResolverEvidence(
            UTF8ToString(nameptr).replace(/^[*&]/, ""), format, "resolved", resolverAttempts
        );
        var ptr = allocateString(savepath);
        return ptr;
    } else {
        var sawMirrorResponse = resolverAttempts.length > 0 && resolverAttempts.every(function(attempt) {
            return attempt.outcome === "not-found";
        });
        if (sawMirrorResponse) {
            texlive404_cache[cacheKey] = 1;
            texlive404_source[cacheKey] = "network";
        }
        self.wasmtexResolverEvidence(
            UTF8ToString(nameptr).replace(/^[*&]/, ""),
            format,
            sawMirrorResponse ? "mirror-absent" : "transport-error",
            resolverAttempts
        );
        return 0;
    }

    return 0;
}

// --- PK font fetching --------------------------------------------------------
//
// Similar to kpse_find_file_impl but for PK (packed bitmap) fonts.
// These are fetched from a separate endpoint.

var pk404_cache = {};
var pk200_cache = {};

function kpse_find_pk_impl(nameptr, dpi) {
    var reqname = UTF8ToString(nameptr);

    if (reqname.includes("/")) {
        return 0;
    }

    var cacheKey = dpi + "/" + reqname;

    if (cacheKey in pk404_cache) {
        return 0;
    }
    if (cacheKey in pk200_cache) {
        var savepath = pk200_cache[cacheKey];
        return allocateString(savepath);
    }

    var remote_url = self.texlive_endpoint + "pdftex/pk/" + cacheKey;
    var xhr = new XMLHttpRequest();
    xhr.open("GET", remote_url, false);
    xhr.timeout = 150000;
    xhr.responseType = "arraybuffer";

    try {
        xhr.send();
    } catch(err) {
        return 0;
    }

    if (xhr.status === 200) {
        var arraybuffer = xhr.response;
        // pkid header comes from texlive server; static hosting won't have it
        var fileid = xhr.getResponseHeader("pkid") || reqname;
        var savepath = TEXCACHEROOT + "/" + fileid;
        FS.writeFile(savepath, new Uint8Array(arraybuffer));
        pk200_cache[cacheKey] = savepath;
        return allocateString(savepath);
    } else {
        pk404_cache[cacheKey] = 1;
        return 0;
    }

    return 0;
}

// --- Compilation routines ----------------------------------------------------

// compileLaTeXRoutine — Main compilation entry point
//
// This is where SyncTeX integration happens. After pdfTeX compiles the
// document (with -synctex=1 implicitly enabled), we:
//   1. Read the generated PDF from the virtual filesystem
//   2. Read the generated .synctex file (if it exists)
//   3. Send both back to the host in the compile response
//
// The .synctex file contains source-to-PDF position mappings that enable
// click-to-jump between the editor and PDF viewer.
async function compileLaTeXRoutine(data) {
    var routineStart = performance.now();
    var phaseTimings = self._activePhaseTimings = {
        formatInstallMs: 0,
        heapSizeBytes: wasmMemory.buffer.byteLength,
        heapRestoreMs: 0,
        heapSnapshotBytes: self.initmem ? self.initmem.byteLength : 0,
        heapSnapshotMs: self._heapSnapshotMs || 0,
        preambleBuildMs: 0,
        preambleExportMs: 0,
        postProcessMs: 0,
        texRunMs: 0,
        workerTotalMs: 0
    };
    prepareExecutionContext();

    // kpathsea does lstat(argv[0]) to find the program directory.
    try { FS.writeFile(WORKROOT + "/pdflatex", ""); } catch(e) {}

    // Build format file on first compilation.
    if (!self._fmtData) {
        prepareExecutionContext();
        cleanDir(TEXCACHEROOT);
        cleanDir(WORKROOT);
        prepareExecutionContext();

        try { FS.writeFile(WORKROOT + "/pdfetex", ""); } catch(e) {}
        
        // Dummy 'nul:' device for TeX
        try { FS.writeFile(WORKROOT + "/nul:", ""); } catch(e) {}
        
        // Inject minimal language.dat to speed up format building (avoids 100+ XHRs)
        var minLangDat = [
            "usenglish hyphen.tex",
            "=usenglishmax",
            "ukenglish  loadhyph-en-gb.tex",
            ""
        ].join("\n");
        try { FS.writeFile(WORKROOT + "/language.dat", minLangDat); } catch(e) {}

        writeTexmfCnf();

        // Ensure no stale format file exists in WORKROOT before -ini run.
        // An incompatible stale format would leave 2025 INITEX "stymied".
        try { FS.unlink(WORKROOT + "/pdflatex.fmt"); } catch(e) {}

        // Re-add * prefix to enable e-TeX extensions (required by modern LaTeX)
        // The mirror resolver strips this '*' before requesting the format.
        var fmtStatus = runMain("pdfetex", ["-ini", "-interaction=nonstopmode", "*pdflatex.ini"]);

        if (fmtStatus === 0) {
            try {
                self._fmtData = builtFmt;
                self._fmtBuiltThisSession = true;
                self._fmtIsNative = true;
            } catch(e) {
                console.error("[compile] Format build succeeded but can't read output: " + e);
            }
        } else {
            self.postMessage({
                "result": "failed",
                "status": fmtStatus,
                "log": self.memlog,
                "cmd": "compile"
            });
            return; // STOP HERE
        }
        prepareExecutionContext();
        try { FS.writeFile(WORKROOT + "/pdflatex", ""); } catch(e) {}
    }

    // --- Preamble snapshot ---------------------------------------------------
    // Detect preamble changes and build a cached format to speed up body edits.
    // We swap which format file gets loaded via the kpse cache.
    var usedPreamble = false;
    var preambleRebuilt = false;
    var texSource = null;
    try { texSource = FS.readFile(WORKROOT + "/" + self.mainfile, { encoding: "utf8" }); }
    catch(e) {}

    var split = texSource ? extractPreamble(texSource) : null;

    if (split && self._fmtIsNative && self._preambleSnapshotEnabled) {
        var hash = simpleHash(split.preamble);
        if (hash === self._preambleHash && self._preambleFmtData) {
            // Preamble cache HIT — reuse cached preamble format
            usedPreamble = true;
        } else {
            // Preamble cache MISS — build new preamble format.
            var fmtBuildStart = performance.now();
            var fmt = buildPreambleFormat(split.preamble);
            var fmtBuildMs = Math.round(performance.now() - fmtBuildStart);
            phaseTimings.preambleBuildMs += fmtBuildMs;
            if (fmt) {
                self._preambleFmtData = fmt;
                self._preambleHash = hash;
                usedPreamble = true;
                preambleRebuilt = true;
                prepareExecutionContext();
                try { FS.writeFile(WORKROOT + "/pdflatex", ""); } catch(e) {}
            } else {
                prepareExecutionContext();
                try { FS.writeFile(WORKROOT + "/pdflatex", ""); } catch(e) {}
            }
        }

        if (usedPreamble) {
            // Write padded body to preserve SyncTeX line numbers
            var padding = "";
            for (var i = 1; i < split.preambleLineCount; i++) padding += "%\n";
            FS.writeFile(WORKROOT + "/" + self.mainfile, padding + split.body);
        }
    }

    // Write format to kpse cache — preamble format if available, else base format.
    // runMain() uses "&pdflatex" to load pdflatex.fmt via kpathsea, so swapping
    // the file in the cache transparently switches between full and preamble formats.
    var fmtToUse = usedPreamble ? self._preambleFmtData : self._fmtData;
    if (fmtToUse) {
        var formatInstallStart = performance.now();
        FS.writeFile(TEXCACHEROOT + "/wasmtex-pdftex.fmt", fmtToUse);
        texlive200_cache["10/wasmtex-pdftex.fmt"] = TEXCACHEROOT + "/wasmtex-pdftex.fmt";
        FS.writeFile(TEXCACHEROOT + "/pdflatex.fmt", fmtToUse);
        texlive200_cache["10/pdflatex.fmt"] = TEXCACHEROOT + "/pdflatex.fmt";
        // Also write to WORKROOT — open_fmt_file() tries fopen() in CWD first,
        // before falling back to kpathsea. "&pdflatex" in runMain() args tells
        // pdfTeX to look for pdflatex.fmt. Without this write, a stale base
        // pdflatex.fmt left by buildPreambleFormat() would be loaded instead.
        FS.writeFile(WORKROOT + "/pdflatex.fmt", fmtToUse);
        phaseTimings.formatInstallMs += performance.now() - formatInstallStart;
    }

    // Semantic trace: write hook file and inject \input{__strace} after \begin{document}.
    // Placed on the same line to avoid shifting line numbers (SyncTeX, error reports).
    FS.writeFile(WORKROOT + "/__strace.tex", SEMANTIC_TRACE_TEX);
    try {
        var currentSrc = FS.readFile(WORKROOT + "/" + self.mainfile, { encoding: "utf8" });
        var bdTag = "\\begin{document}";
        var bdIdx = currentSrc.indexOf(bdTag);
        if (bdIdx >= 0) {
            var afterBD = bdIdx + bdTag.length;
            var injected = currentSrc.slice(0, afterBD) + "\\input{__strace}" + currentSrc.slice(afterBD);
            FS.writeFile(WORKROOT + "/" + self.mainfile, injected);
        }
    } catch(e) {}

    // Compile via runMain() — all compilation goes through the same _main() path,
    // allowing preamble format rebuilds at any point in the session.
    writeTexmfCnf();
    var compileStart = performance.now();
    var status;
    // Heap checkpoints (#81): suspend at the requested lines of the file TeX is about to
    // read and keep a resumable copy of the engine state; the run then continues.
    hcArm(data && data["checkpoints"], { usedPreamble: usedPreamble, preambleLineCount: split ? split.preambleLineCount : 0 });
    try {
        status = await runTexMain(["-interaction=nonstopmode", "-synctex=1",
                                   "-recorder", "&pdflatex", self.mainfile]);
    } catch(e) {
        if (e instanceof ExitStatus) {
            status = e.status;
        } else {
            // Emscripten abort() or other fatal error — do NOT re-throw.
            // Re-throwing skips file restore and response, hanging the host forever.
            console.error("[compile] runMain crashed: " + e);
            status = -254;
        }
    }
    hcDisarm();
    var compileMs = Math.round(performance.now() - compileStart);
    phaseTimings.texRunMs += compileMs;

    // Restore original main.tex after compilation.
    // The preamble path replaces main.tex with a padded body, and the trace
    // injection adds \input{__strace} after \begin{document}. Restore the
    // original source so recompiles (e.g. "Rerun to get cross-references right")
    // see the correct content and extractPreamble() works.
    if (texSource) {
        FS.writeFile(WORKROOT + "/" + self.mainfile, texSource);
    }

    // If preamble compile failed or produced critical errors, fall back to full compile.
    // In nonstopmode, pdfTeX can return status 0 even with massive errors (e.g. missing
    // LaTeX kernel). Detect these by checking the log for telltale error patterns.
    var preambleHasCriticalErrors = usedPreamble && (
        self.memlog.includes("normalsize is not defined") ||
        self.memlog.includes("Undefined control sequence")
    );
    if (usedPreamble && (status !== 0 || preambleHasCriticalErrors)) {
        self._preambleFmtData = null;
        self._preambleInputFiles = null;
        self._preambleHash = "";
        usedPreamble = false;

        prepareExecutionContext();
        try { FS.writeFile(WORKROOT + "/pdflatex", ""); } catch(e) {}

        // Restore original file content and base format
        FS.writeFile(WORKROOT + "/" + self.mainfile, texSource);
        if (self._fmtData) {
            var fallbackFormatInstallStart = performance.now();
            FS.writeFile(TEXCACHEROOT + "/wasmtex-pdftex.fmt", self._fmtData);
            texlive200_cache["10/wasmtex-pdftex.fmt"] = TEXCACHEROOT + "/wasmtex-pdftex.fmt";
            FS.writeFile(TEXCACHEROOT + "/pdflatex.fmt", self._fmtData);
            texlive200_cache["10/pdflatex.fmt"] = TEXCACHEROOT + "/pdflatex.fmt";
            // Must also write to WORKROOT — open_fmt_file() tries fopen() in CWD first.
            // Without this, the stale preamble format left by the normal compile path
            // would be loaded instead of the base format, causing permanent failure.
            FS.writeFile(WORKROOT + "/pdflatex.fmt", self._fmtData);
            phaseTimings.formatInstallMs += performance.now() - fallbackFormatInstallStart;
        }

        writeTexmfCnf();
        var fallbackStart = performance.now();
        try {
            status = await runTexMain(["-interaction=nonstopmode", "-synctex=1",
                                       "-recorder", "&pdflatex", self.mainfile]);
        } catch(e) {
            if (e instanceof ExitStatus) {
                status = e.status;
            } else {
                console.error("[compile] fallback runMain crashed: " + e);
                status = -254;
            }
        }
        phaseTimings.texRunMs += performance.now() - fallbackStart;
    }

    finishCompile({ routineStart: routineStart, phaseTimings: phaseTimings, usedPreamble: usedPreamble, preambleRebuilt: preambleRebuilt }, status);
}

// Post-run bookkeeping shared by a normal compile and a checkpoint resume: engine
// command scan, recorder inputs, semantic trace, PDF/SyncTeX read-back and the response.
function finishCompile(ctx, status) {
    var routineStart = ctx.routineStart;
    var phaseTimings = ctx.phaseTimings;
    var usedPreamble = ctx.usedPreamble;
    var preambleRebuilt = ctx.preambleRebuilt;
    var postProcessStart = performance.now();

    // Semantic Trace: extract defined commands from pdfTeX hash table.
    // Run regardless of exit status — the hash table is populated even when
    // pdfTeX returns status 1 (warnings / non-fatal errors).
    var engineCommands = null;
    var engineCommandsComplete = false;
    var engineCommandsDropped;
    try {
        ["/.commands", "/.commands-meta", "/.completion-observations"].forEach(function(path) {
            try { FS.unlink(WORKROOT + path); } catch(e2) {}
        });
        _scanHashTable();
        var cmdData = FS.readFile(WORKROOT + "/.commands", { encoding: "utf8" });
        if (cmdData && cmdData.length > 0) {
            engineCommands = cmdData.trimEnd().split("\n");
        } else {
            engineCommands = [];
        }
        try { FS.unlink(WORKROOT + "/.commands"); } catch(e2) {}
    } catch(e) {}
    try {
        var commandMeta = FS.readFile(WORKROOT + "/.commands-meta", { encoding: "utf8" });
        var trimmedCommandMeta = commandMeta.trim();
        var parsedCommandDropped = /^\d+$/.test(trimmedCommandMeta)
            ? Number(trimmedCommandMeta)
            : Number.NaN;
        if (Number.isSafeInteger(parsedCommandDropped) && parsedCommandDropped >= 0) {
            engineCommandsDropped = parsedCommandDropped;
            engineCommandsComplete = parsedCommandDropped === 0;
        }
        try { FS.unlink(WORKROOT + "/.commands-meta"); } catch(e2) {}
    } catch(e) {}

    // Bounded runtime completion evidence (counters, colors, key families) emitted
    // by the same read-only post-compile hash scan. Older engine cores omit the file;
    // the host then marks those snapshot fields explicitly unsupported.
    var completionObservations = null;
    try {
        var observationData = FS.readFile(WORKROOT + "/.completion-observations", { encoding: "utf8" });
        if (observationData && observationData.length > 0) {
            completionObservations = observationData.trimEnd().split("\n");
        } else {
            completionObservations = [];
        }
        try { FS.unlink(WORKROOT + "/.completion-observations"); } catch(e2) {}
    } catch(e) {}

    // Read .fls (file recorder output) to discover every engine input. A cached
    // preamble format hides its reads from the body pass, so union the recorder
    // list captured when that exact preamble snapshot was built.
    var baseName = self.mainfile.substr(0, self.mainfile.length - 4);
    var bodyInputFiles = readRecorderInputs(baseName);
    var inputFiles = usedPreamble
        ? mergeRecorderInputs(self._preambleInputFiles, bodyInputFiles)
        : bodyInputFiles;
    var inputFilesComplete = inputFiles !== null;

    // Read .trace (semantic trace output from \label/\ref hooks).
    var semanticTrace = null;
    try {
        var traceData = FS.readFile(WORKROOT + "/" + baseName + ".trace", { encoding: "utf8" });
        if (traceData && traceData.length > 0) {
            semanticTrace = traceData;
        }
        try { FS.unlink(WORKROOT + "/" + baseName + ".trace"); } catch(e2) {}
    } catch(e) {}

    // pdfTeX exit code 0 = success, 1 = completed with warnings/errors.
    // Both can produce valid PDF output, so try to read it for either.
    if (status === 0 || status === 1) {
        var pdfArrayBuffer = null;

        _compileBibtex();

        var pdfPath = WORKROOT + "/" + baseName + ".pdf";

        try {
            pdfArrayBuffer = FS.readFile(pdfPath, { encoding: "binary" });
        } catch(err) {
            self.postMessage({
                "result": "failed",
                "status": status,
                "log": self.memlog,
                "cmd": "compile",
                "engineCommands": engineCommands,
                "engineCommandsComplete": engineCommandsComplete,
                "engineCommandsDropped": engineCommandsDropped,
                "completionObservations": completionObservations,
                "inputFiles": inputFiles,
                "inputFilesComplete": inputFilesComplete,
                "semanticTrace": semanticTrace
            });
            return;
        }

        // SyncTeX extraction
        var synctexData = null;
        var synctexPath = WORKROOT + "/" + baseName + ".synctex";
        var synctexGzPath = WORKROOT + "/" + baseName + ".synctex.gz";

        try {
            synctexData = FS.readFile(synctexPath, { encoding: "binary" });
        } catch(e) {
            try {
                synctexData = FS.readFile(synctexGzPath, { encoding: "binary" });
            } catch(e2) {}
        }

        var response = {
            "result": "ok",
            "status": status,
            "log": self.memlog,
            "pdf": pdfArrayBuffer.buffer,
            "cmd": "compile",
            "preambleSnapshot": usedPreamble,
            "preambleRebuilt": preambleRebuilt,
            "phaseTimings": phaseTimings,
            "engineCommands": engineCommands,
            "engineCommandsComplete": engineCommandsComplete,
            "engineCommandsDropped": engineCommandsDropped,
            "completionObservations": completionObservations,
            "inputFiles": inputFiles,
            "inputFilesComplete": inputFilesComplete,
            "semanticTrace": semanticTrace,
            "heapCheckpoints": hcTaken()
        };

        var transferables = [pdfArrayBuffer.buffer];

        if (synctexData !== null) {
            response["synctex"] = synctexData.buffer;
            transferables.push(synctexData.buffer);
        }

        if (self._fmtBuiltThisSession) {
            var fmtCopy = new Uint8Array(self._fmtData);
            response["format"] = fmtCopy.buffer;
            transferables.push(fmtCopy.buffer);
            self._fmtBuiltThisSession = false;
        }

        if (preambleRebuilt && self._preambleFmtData) {
            var preambleExportStart = performance.now();
            var preambleCopy = new Uint8Array(self._preambleFmtData);
            response["preambleFormat"] = preambleCopy.buffer;
            response["preambleHash"] = self._preambleHash;
            response["preambleInputFiles"] = self._preambleInputFiles || [];
            transferables.push(preambleCopy.buffer);
            phaseTimings.preambleExportMs += performance.now() - preambleExportStart;
        }

        phaseTimings.heapSizeBytes = wasmMemory.buffer.byteLength;
        phaseTimings.postProcessMs = performance.now() - postProcessStart;
        phaseTimings.workerTotalMs = performance.now() - routineStart;

        self.postMessage(response, transferables);

    } else {
        phaseTimings.heapSizeBytes = wasmMemory.buffer.byteLength;
        phaseTimings.postProcessMs = performance.now() - postProcessStart;
        phaseTimings.workerTotalMs = performance.now() - routineStart;
        self.postMessage({
            "result": "failed",
            "status": status,
            "log": self.memlog,
            "cmd": "compile",
            "preambleSnapshot": false,
            "preambleRebuilt": preambleRebuilt,
            "phaseTimings": phaseTimings,
            "engineCommands": engineCommands,
            "engineCommandsComplete": engineCommandsComplete,
            "engineCommandsDropped": engineCommandsDropped,
            "completionObservations": completionObservations,
            "inputFiles": inputFiles,
            "inputFilesComplete": false,
            "semanticTrace": semanticTrace
        });
    }
}

function compileFormatRoutine() {
    prepareExecutionContext();
    writeTexmfCnf();

    // kpathsea resolves argv[0] to select the e-TeX-enabled INITEX program.
    try { FS.writeFile(WORKROOT + "/pdfetex", ""); } catch(e) {}

    // Same ExitStatus handling as compileLaTeXRoutine
    var status;
    try {
        status = _compileFormat();
    } catch(e) {
        if (e instanceof ExitStatus) {
            status = e.status;
        } else {
            console.error("[compile] compileFormat crashed: " + e);
            status = -254;
        }
    }

    if (status === 0) {
        var fmtArrayBuffer = null;
        try {
            var fmtPath = WORKROOT + "/pdflatex.fmt";
            fmtArrayBuffer = FS.readFile(fmtPath, { encoding: "binary" });
        } catch(err) {
            status = -253;
            self.postMessage({
                "result": "failed",
                "status": status,
                "log": self.memlog,
                "cmd": "compile"
            });
            return;
        }
        self.postMessage({
            "result": "ok",
            "status": status,
            "log": self.memlog,
            "pdf": fmtArrayBuffer.buffer,
            "cmd": "compile"
        }, [fmtArrayBuffer.buffer]);
    } else {
        self.postMessage({
            "result": "failed",
            "status": status,
            "log": self.memlog,
            "cmd": "compile"
        });
    }
}

// --- Incremental compile: mid-document checkpoints (#55) ---------------------
//
// Generalizes the preamble snapshot to ANY page boundary. buildCheckpointRoutine
// runs `head + \dump` in INITEX, producing (a) a bootable format that captures the
// engine state at the boundary (counters, macros, fonts, and the .aux label table
// read at \begin{document}) and (b) the head PDF (pages up to the boundary).
// compileFromCheckpointRoutine boots that format and typesets only the tail; the
// host splices headPDF + tailPDF. The head MUST end at an existing page break
// (\clearpage/\newpage) so pagination matches a full compile.

function buildCheckpointRoutine(data) {
    var headText = data["headText"] || "";
    var msgId = data["msgId"];
    prepareExecutionContext();
    writeTexmfCnf();
    try { FS.writeFile(WORKROOT + "/pdflatex", ""); } catch(e) {}

    // Base format is required for -ini "&pdflatex".
    if (self._fmtData) {
        FS.writeFile(TEXCACHEROOT + "/pdflatex.fmt", self._fmtData);
        texlive200_cache["10/pdflatex.fmt"] = TEXCACHEROOT + "/pdflatex.fmt";
        FS.writeFile(WORKROOT + "/pdflatex.fmt", self._fmtData);
    }

    // Seed the checkpoint jobname's .aux from the last full compile so the head's
    // \begin{document} loads cross-reference labels into the dumped state.
    try {
        var mainAux = FS.readFile(WORKROOT + "/main.aux", { encoding: "binary" });
        FS.writeFile(WORKROOT + "/_checkpoint.aux", mainAux);
    } catch(e) {}

    FS.writeFile(WORKROOT + "/_checkpoint.tex", headText + "\n\\dump\n");
    var status;
    try {
        status = runMain("pdflatex", ["-ini", "-interaction=nonstopmode", "&pdflatex", "_checkpoint.tex"]);
    } catch(e) { status = (e instanceof ExitStatus) ? e.status : -254; }

    var fmt = null, headPdf = null;
    try { fmt = FS.readFile(WORKROOT + "/_checkpoint.fmt", { encoding: "binary" }); } catch(e) {}
    try { headPdf = FS.readFile(WORKROOT + "/_checkpoint.pdf", { encoding: "binary" }); } catch(e) {}
    // A format much smaller than the base means the dump failed (e.g. broken head).
    if (fmt && self._fmtData && fmt.length < self._fmtData.length * 0.5) fmt = null;

    var resp = { "result": fmt ? "ok" : "failed", "cmd": "buildcheckpoint", "status": status, "log": self.memlog };
    if (msgId) resp["msgId"] = msgId;
    var tr = [];
    if (fmt) { resp["fmt"] = fmt.buffer; tr.push(fmt.buffer); }
    if (headPdf) { resp["headPdf"] = headPdf.buffer; tr.push(headPdf.buffer); }
    self.postMessage(resp, tr);
}

function compileFromCheckpointRoutine(data) {
    var msgId = data["msgId"];
    prepareExecutionContext();
    try { FS.writeFile(WORKROOT + "/pdflatex", ""); } catch(e) {}

    var fmtU8 = new Uint8Array(data["fmt"]);
    FS.writeFile(TEXCACHEROOT + "/pdflatex.fmt", fmtU8);
    texlive200_cache["10/pdflatex.fmt"] = TEXCACHEROOT + "/pdflatex.fmt";
    FS.writeFile(WORKROOT + "/pdflatex.fmt", fmtU8);

    FS.writeFile(WORKROOT + "/tail.tex", data["tailText"] || "");
    // \end{document} reads tail.aux; provide the prior main.aux so it completes and
    // its rerun-check passes. Labels are already baked into the booted format.
    try {
        var aux = FS.readFile(WORKROOT + "/main.aux", { encoding: "binary" });
        FS.writeFile(WORKROOT + "/tail.aux", aux);
    } catch(e) {}

    writeTexmfCnf();
    var status;
    try {
        status = runMain("pdflatex", ["-interaction=nonstopmode", "-synctex=1", "&pdflatex", "tail.tex"]);
    } catch(e) { status = (e instanceof ExitStatus) ? e.status : -254; }

    var pdf = null;
    try { pdf = FS.readFile(WORKROOT + "/tail.pdf", { encoding: "binary" }); } catch(e) {}
    var resp = {
        "result": (pdf && (status === 0 || status === 1)) ? "ok" : "failed",
        "cmd": "compilefromcheckpoint", "status": status, "log": self.memlog
    };
    if (msgId) resp["msgId"] = msgId;
    var tr = [];
    if (pdf) { resp["pdf"] = pdf.buffer; tr.push(pdf.buffer); }
    var sx = null;
    try { sx = FS.readFile(WORKROOT + "/tail.synctex", { encoding: "binary" }); }
    catch(e) { try { sx = FS.readFile(WORKROOT + "/tail.synctex.gz", { encoding: "binary" }); } catch(e2) {} }
    if (sx) { resp["synctex"] = sx.buffer; tr.push(sx.buffer); }
    self.postMessage(resp, tr);
}

// --- File I/O routines -------------------------------------------------------

function mkdirRoutine(dirname) {
    try {
        FS.mkdir(WORKROOT + "/" + dirname);
        self.postMessage({ "result": "ok", "cmd": "mkdir" });
    } catch(err) {
        console.error("Not able to mkdir " + dirname);
        self.postMessage({ "result": "failed", "cmd": "mkdir" });
    }
}

function writeFileRoutine(filename, content) {
    try {
        // A cached format can embed project files read by the preamble. Invalidate
        // only when one of those recorded inputs changes; main.tex body edits keep
        // using the preamble hash fast path, and unrelated/body-only files do not
        // force a costly snapshot rebuild.
        invalidatePreambleForWrite(filename);
        FS.writeFile(WORKROOT + "/" + filename, content);
        hcNoteHostWrite(filename, content);
        self.postMessage({ "result": "ok", "cmd": "writefile" });
    } catch(err) {
        console.error("Unable to write file " + filename);
        self.postMessage({ "result": "failed", "cmd": "writefile" });
    }
}

function setTexliveEndpoint(url) {
    if (url) {
        if (!url.endsWith("/")) {
            url += "/";
        }
        self.texlive_endpoint = url;
    }
}

// --- Message handler ---------------------------------------------------------
//
// This is the main entry point for the worker. The host sends commands via
// postMessage, and we dispatch them to the appropriate routine.
//
// The WasmTex protocol includes one
// addition: the compile response now includes a "synctex" field containing
// the raw SyncTeX data (when available).

self["onmessage"] = function(ev) {
    var data = ev["data"];
    var cmd = data["cmd"];

    if (cmd === "compilelatex") {
        compileLaTeXRoutine(data).catch(function(e) { hcReportCrash("compile", e); });
    } else if (cmd === "compileheapcheckpoint") {
        compileFromHeapCheckpointRoutine(data).catch(function(e) { hcReportCrash("compile", e); });
    } else if (cmd === "dropheapcheckpoints") {
        hcDrop(data["ids"]);
        self.postMessage({ "result": "ok", "cmd": "dropheapcheckpoints" });
    } else if (cmd === "compileformat") {
        compileFormatRoutine();
    } else if (cmd === "settexliveurl") {
        setTexliveEndpoint(data["url"]);
    } else if (cmd === "mkdir") {
        mkdirRoutine(data["url"]);
    } else if (cmd === "writefile") {
        writeFileRoutine(data["url"], data["src"]);
    } else if (cmd === "setmainfile") {
        self.mainfile = data["url"];
    } else if (cmd === "loadformat") {
        // Pre-load a format file (.fmt).
        var fmtData = new Uint8Array(data["data"]);
        self._fmtData = fmtData;
        self._fmtIsNative = true;
        self.postMessage({ "result": "ok", "cmd": "loadformat" });
    } else if (cmd === "preloadtexlive") {
        // Pre-load a texlive file from main thread (avoids sync XHR on first compile).
        // data: {format, filename, data: ArrayBuffer, msgId}
        var format = data["format"];
        var filename = data["filename"];
        var fileData = new Uint8Array(data["data"]);
        var msgId = data["msgId"];
        var cacheKey = format + "/" + filename;
        // Same on-disk name as the fetch path: TEXCACHEROOT is flat, so a TFM
        // (format 3) and a VF (format 33) requested under the same bare name
        // (e.g. `ptmr7t`) must not overwrite each other. Without the extension
        // normalization a preloaded/rehydrated VF clobbers the TFM and pdfTeX
        // fails with "Bad metric (TFM) file".
        var savepath = TEXCACHEROOT + "/" + cacheFileName(format, filename);
        FS.writeFile(savepath, fileData);
        texlive200_cache[cacheKey] = savepath;
        texlive200_source[cacheKey] = data["source"] === "persistent-cache"
            ? "persistent-cache" : "warmup-cache";
        delete texlive404_cache[cacheKey];
        delete texlive404_source[cacheKey];
        if (format === 10) {
            FS.writeFile(WORKROOT + "/" + filename, fileData);
        }
        self.postMessage({ "result": "ok", "cmd": "preloadtexlive", "msgId": msgId });
    } else if (cmd === "loadbloom") {
        // Load bloom filter for CDN existence checks.
        // Binary format: [4B magic "BF01"] [1B k] [4B m big-endian] [ceil(m/8)B bits]
        var bloomData = new Uint8Array(data["data"]);
        if (bloomData.length >= 9) {
            // Verify magic bytes "BF01"
            if (bloomData[0] === 0x42 && bloomData[1] === 0x46 &&
                bloomData[2] === 0x30 && bloomData[3] === 0x31) {
                bloom_k = bloomData[4];
                bloom_m = (bloomData[5] << 24) | (bloomData[6] << 16) |
                          (bloomData[7] << 8) | bloomData[8];
                bloom_bits = bloomData.subarray(9);
            } else {
                console.warn("[bloom] invalid magic bytes, ignoring");
            }
        }
    } else if (cmd === "preload404") {
        // Batch-inject known 404 entries into the cache to avoid wasted sync XHR.
        var entries = data["entries"];
        var msgId = data["msgId"];
        for (var i = 0; i < entries.length; i++) {
            var cacheKey = entries[i].format + "/" + entries[i].filename;
            if (!(cacheKey in texlive200_cache)) {
                texlive404_cache[cacheKey] = 1;
                texlive404_source[cacheKey] = data["source"] === "durable-negative"
                    ? "durable-negative" : "warmup-negative";
            }
        }
        self.postMessage({ "result": "ok", "cmd": "preload404", "msgId": msgId });
    } else if (cmd === "grace") {
        self.close();
    } else if (cmd === "readfile") {
        // Read a file from the virtual filesystem and return its contents.
        try {
            var d = FS.readFile(
                WORKROOT + "/" + data["url"],
                { encoding: data["encoding"] || "utf8" }
            );
            self.postMessage({
                "result": "ok",
                "cmd": "readfile",
                "url": data["url"],
                "data": d
            });
        } catch(e) {
            self.postMessage({
                "result": "failed",
                "cmd": "readfile",
                "url": data["url"]
            });
        }
    } else if (cmd === "setpreamblesnapshot") {
        // Host opt-out toggle for precompiled preamble snapshots.
        // When disabled, every compile re-runs the full preamble (no .fmt reuse).
        self._preambleSnapshotEnabled = data["enabled"] !== false;
        if (!self._preambleSnapshotEnabled) {
            // Drop any cached preamble format so re-enabling rebuilds it cleanly.
            self._preambleFmtData = null;
            self._preambleInputFiles = null;
            self._preambleHash = "";
        }
        self.postMessage({ "result": "ok", "cmd": "setpreamblesnapshot" });
    } else if (cmd === "loadpreamblesnapshot") {
        var preambleFormat = data["format"] ? new Uint8Array(data["format"]) : null;
        var preambleHash = data["hash"];
        var preambleInputs = data["inputFiles"];
        var validPreamble = self._preambleSnapshotEnabled && preambleFormat &&
            self._fmtData && preambleFormat.length >= self._fmtData.length * 0.5 &&
            typeof preambleHash === "string" && preambleHash.length > 0 &&
            Array.isArray(preambleInputs);
        if (validPreamble) {
            self._preambleFmtData = preambleFormat;
            self._preambleHash = preambleHash;
            self._preambleInputFiles = preambleInputs.slice();
        }
        self.postMessage({
            "result": validPreamble ? "ok" : "failed",
            "cmd": "loadpreamblesnapshot"
        });
    } else if (cmd === "dumpcache") {
        // Export every TeX Live file fetched/preloaded this session so the host
        // can persist it (built-in persistent cache). Keys in texlive200_cache
        // are "<format>/<requested-name>"; values are paths in the in-memory FS.
        var dumpId = data["msgId"];
        var dumpFiles = [];
        var dumpTransfer = [];
        for (var ck in texlive200_cache) {
            var slash = ck.indexOf("/");
            if (slash < 0) continue;
            var dfmt = parseInt(ck.substring(0, slash), 10);
            var dname = ck.substring(slash + 1);
            // Skip format files (.fmt, format 10): the base format is reloaded
            // from the engine bundle each session and the preamble format is
            // project-specific — persisting either is useless and the multi-MB
            // blob would only churn eviction of genuinely-fetched TeX Live files.
            if (dfmt === 10) continue;
            try {
                var fbuf = FS.readFile(texlive200_cache[ck], { encoding: "binary" });
                // Copy into a standalone ArrayBuffer so transferring it does not
                // detach the worker's own in-memory FS data.
                var fcopy = new Uint8Array(fbuf.length);
                fcopy.set(fbuf);
                dumpFiles.push({ "format": dfmt, "filename": dname, "data": fcopy.buffer });
                dumpTransfer.push(fcopy.buffer);
            } catch (e) {}
        }
        var dumpNotFound = [];
        for (var nk in texlive404_cache) {
            var ns = nk.indexOf("/");
            if (ns < 0) continue;
            dumpNotFound.push({ "format": parseInt(nk.substring(0, ns), 10), "filename": nk.substring(ns + 1) });
        }
        self.postMessage(
            { "result": "ok", "cmd": "dumpcache", "msgId": dumpId, "files": dumpFiles, "notFound": dumpNotFound },
            dumpTransfer
        );
    } else if (cmd === "flushcache") {
        cleanDir(WORKROOT);
        hcReset();
        // A snapshot can embed project-local inputs. It must never survive a
        // project replacement whose preamble text happens to hash identically.
        self._preambleFmtData = null;
        self._preambleInputFiles = null;
        self._preambleHash = "";
    } else if (cmd === "buildcheckpoint") {
        buildCheckpointRoutine(data);
    } else if (cmd === "compilefromcheckpoint") {
        compileFromCheckpointRoutine(data);
    } else {
        console.error("Unknown command " + cmd);
    }
};

self.kpse_find_file_impl = kpse_find_file_impl;
self.kpse_find_pk_impl = kpse_find_pk_impl;

// --- Heap checkpoints (#81) ---------------------------------------------------
//
// Only on the Asyncify engine build. TeX's read of the main file is cut short at a
// requested byte offset; the read at that offset calls Asyncify.handleSleep, which
// unwinds the whole call stack into linear memory. At that moment the engine state
// is "memory + a few JS-side pieces" and a copy of it is a checkpoint that can be
// restored ANY number of times: restore, rewind, and TeX continues reading the
// (new) tail of the file, writing the PDF and SyncTeX to the end itself.
//
// Checkpoints are keyed by host-provided ids; the host decides where they go and
// when a source edit may resume from one (the bytes before the offset must be
// unchanged, and so must every project file TeX had opened by then).

var HC_PAGE = 65536;
self._hc = {
    checkpoints: {},      // id -> snapshot
    armed: [],            // [{id, line, offset, node}] sorted by offset, for the run in progress
    taken: [],            // [{id, line, bytes, ms}] taken during the run in progress
    pending: null,        // {wakeUp, cp} of the suspended run
    resuming: null,       // {node} while a fork's first read must stop the rewind
    hookInstalled: false,
    dataPtr: 0,           // preallocated Asyncify data buffer
    hostWrites: {},       // path -> latest content the host wrote (re-applied after a restore)
    transform: null       // how the main file was rewritten for the run in progress
};

function hcSupported() {
    return typeof Asyncify !== "undefined" && typeof _asyncify_start_rewind === "function";
}

function hcReset() {
    self._hc.checkpoints = {};
    self._hc.hostWrites = {};
}

function hcNoteHostWrite(filename, content) {
    self._hc.hostWrites[filename] = content;
}

function hcReportCrash(cmd, e) {
    console.error("[heap-checkpoint] " + (e && e.stack || e));
    self.postMessage({ "result": "failed", "status": -254, "log": self.memlog + "\n" + String(e), "cmd": cmd });
}

function hcTaken() {
    return self._hc.taken.slice();
}

function hcDrop(ids) {
    if (!ids) { self._hc.checkpoints = {}; return; }
    for (var i = 0; i < ids.length; i++) delete self._hc.checkpoints[ids[i]];
}

function hcLineOffset(text, line) {
    if (line <= 1) return 0;
    var at = -1;
    for (var n = 1; n < line; n++) {
        at = text.indexOf("\n", at + 1);
        if (at < 0) return -1;
    }
    return new TextEncoder().encode(text.substring(0, at + 1)).length;
}

// Arm checkpoints for the run about to start. `checkpoints` is [{id, line}] in the
// host's line numbering, which every rewrite of the main file preserves.
function hcArm(checkpoints, transform) {
    self._hc.armed = [];
    self._hc.taken = [];
    self._hc.transform = transform || null;
    if (!checkpoints || !checkpoints.length || !hcSupported()) return;
    hcInstallReadHook();
    if (!self._hc.dataPtr) {
        // One Asyncify data buffer per worker at a stable address; the runtime's own
        // malloc/free per unwind would move it around the heap.
        var ptr = _malloc(12 + Asyncify.StackSize);
        self._hc.dataPtr = ptr;
        Asyncify.allocateData = function() {
            Asyncify.setDataHeader(ptr, ptr + 12, Asyncify.StackSize);
            Asyncify.setDataRewindFunc(ptr);
            return ptr;
        };
        var origFree = _free;
        _free = function(p) { if (p === ptr) return; return origFree(p); };
    }
    var path = WORKROOT + "/" + self.mainfile;
    var text = FS.readFile(path, { encoding: "utf8" });
    var node = FS.lookupPath(path).node;
    var seen = {};
    for (var i = 0; i < checkpoints.length; i++) {
        var cp = checkpoints[i];
        var offset = hcLineOffset(text, cp.line);
        if (offset < 0 || seen[offset]) continue;
        seen[offset] = true;
        self._hc.armed.push({ id: cp.id, line: cp.line, offset: offset, node: node });
    }
    self._hc.armed.sort(function(a, b) { return a.offset - b.offset; });
}

function hcDisarm() {
    self._hc.armed = [];
    self._hc.resuming = null;
}

function hcInstallReadHook() {
    if (self._hc.hookInstalled) return;
    self._hc.hookInstalled = true;
    var origRead = FS.read;
    FS.read = function(stream, buffer, offset, length, position) {
        // While unwinding, serve nothing: fd_read's iov loop would otherwise keep
        // reading and advance the stream past the checkpoint.
        if (Asyncify.state === Asyncify.State.Unwinding) return 0;
        if (length === 0) return origRead.call(FS, stream, buffer, offset, length, position);
        // A resumed fork: the rewound import call must stop the rewind before it reads.
        var rs = self._hc.resuming;
        if (rs && Asyncify.state === Asyncify.State.Rewinding && stream.node === rs.node) {
            Asyncify.handleSleep(function() {});
            self._hc.resuming = null;
            return origRead.call(FS, stream, buffer, offset, length, position);
        }
        var armed = self._hc.armed;
        if (armed.length && stream.node === armed[0].node) {
            var pos = (typeof position === "undefined") ? stream.position : position;
            var cp = armed[0];
            if (pos < cp.offset && pos + length > cp.offset) {
                length = cp.offset - pos;              // stop exactly at the checkpoint
            } else if (pos === cp.offset) {
                if (Asyncify.state === Asyncify.State.Normal) {
                    Asyncify.handleSleep(function(wakeUp) { self._hc.pending = { wakeUp: wakeUp, cp: cp }; });
                    return 0;                          // unwinding; value ignored
                }
                if (Asyncify.state === Asyncify.State.Rewinding) {
                    Asyncify.handleSleep(function() {}); // completes the rewind
                    armed.shift();                       // this checkpoint is done
                }
            } else if (pos > cp.offset) {
                armed.shift();                           // already past it; cannot stop there
            }
        }
        return origRead.call(FS, stream, buffer, offset, length, position);
    };
}

// Sparse memory image: only 64 KiB pages with a non-zero byte are kept (a grown heap
// is mostly pages TeX never touched).
function hcSparseImage() {
    var src = new Uint8Array(wasmMemory.buffer);
    var pages = Math.ceil(src.length / HC_PAGE), kept = [], bytes = 0;
    for (var pi = 0; pi < pages; pi++) {
        var a = pi * HC_PAGE, b = Math.min(src.length, a + HC_PAGE);
        var words = new Int32Array(src.buffer, a, (b - a) >> 2);
        var zero = true;
        for (var k = 0; k < words.length; k++) { if (words[k]) { zero = false; break; } }
        if (zero) continue;
        kept.push({ at: a, data: src.slice(a, b) });
        bytes += b - a;
    }
    return { length: src.length, pages: kept, bytes: bytes };
}

function hcSnapshotFS() {
    var files = {};
    (function walk(dir) {
        var names = FS.readdir(dir);
        for (var i = 0; i < names.length; i++) {
            var n = names[i];
            if (n === "." || n === "..") continue;
            var p = dir + "/" + n;
            var st = FS.stat(p);
            if (FS.isDir(st.mode)) { walk(p); continue; }
            if (/\.fmt$/.test(n)) continue;   // read before any checkpoint; multi-MB
            var node = FS.lookupPath(p).node;
            files[p] = node.contents ? node.contents.slice(0, node.usedBytes) : new Uint8Array(0);
        }
    })(WORKROOT);
    var streams = [];
    for (var fd = 3; fd < FS.streams.length; fd++) {
        var s = FS.streams[fd];
        if (!s) continue;
        streams.push({ fd: fd, path: s.path, flags: s.flags, position: s.position });
    }
    return { files: files, streams: streams };
}

function hcRestoreFS(snap) {
    closeFSStreams();
    cleanDir(WORKROOT);
    var p;
    for (p in snap.files) {
        var dir = p.substring(0, p.lastIndexOf("/"));
        try { FS.mkdirTree(dir); } catch(e) {}
        FS.writeFile(p, snap.files[p]);
    }
    // Project files are the host's: whatever it wrote last wins over the checkpoint's copy.
    for (p in self._hc.hostWrites) {
        var full = WORKROOT + "/" + p;
        var d2 = full.substring(0, full.lastIndexOf("/"));
        try { FS.mkdirTree(d2); } catch(e) {}
        FS.writeFile(full, self._hc.hostWrites[p]);
    }
    var placeholders = [];
    for (var i = 0; i < snap.streams.length; i++) {
        var st = snap.streams[i];
        var stream = FS.open(st.path, st.flags);
        while (stream.fd < st.fd) {          // keep fd numbering identical to the C side
            placeholders.push(stream);
            stream = FS.open(st.path, st.flags);
        }
        if (stream.fd !== st.fd) throw new Error("heap checkpoint: fd " + stream.fd + " != " + st.fd);
        stream.position = st.position;
    }
    for (var k = 0; k < placeholders.length; k++) { try { FS.close(placeholders[k]); } catch(e) {} }
}

function hcTakeSnapshot(cp) {
    var t0 = performance.now();
    var image = hcSparseImage();
    var inputs = null;
    try { inputs = readRecorderInputs(self.mainfile.substr(0, self.mainfile.length - 4)); } catch(e) {}
    var snap = {
        id: cp.id, line: cp.line, offset: cp.offset,
        image: image, currData: Asyncify.currData, sp: stackSave(),
        fs: hcSnapshotFS(), memlog: self.memlog,
        transform: self._hc.transform, inputs: inputs,
        bytes: image.bytes, ms: 0
    };
    snap.ms = performance.now() - t0;
    return snap;
}

function hcRestoreMemory(snap) {
    var need = snap.image.length, have = wasmMemory.buffer.byteLength;
    if (need > have) {
        wasmMemory.grow(Math.ceil((need - have) / HC_PAGE));
        updateMemoryViews();
    }
    var dst = new Uint8Array(wasmMemory.buffer);
    dst.fill(0);
    for (var i = 0; i < snap.image.pages.length; i++) {
        var pg = snap.image.pages[i];
        dst.set(pg.data, pg.at);
    }
    stackRestore(snap.sp);
}

// The TeX main pass; on the Asyncify engine an armed checkpoint suspends it, we
// snapshot, then let it continue. Resolves with the exit status once TeX finished.
async function runTexMain(args) {
    if (!hcSupported() || !self._hc.armed.length) return runMain("pdflatex", args);
    return runMainAsync("pdflatex", args);
}

async function runMainAsync(programName, args) {
    var savedProgram = thisProgram;
    thisProgram = "./" + programName;
    var fullArgs = [programName].concat(args);
    var argPtrs = fullArgs.map(allocateString);
    argPtrs.push(0);
    var argv = _malloc(argPtrs.length * 4);
    var dv = new DataView(wasmMemory.buffer);
    for (var i = 0; i < argPtrs.length; i++) dv.setUint32(argv + i * 4, argPtrs[i], true);
    var status;
    try {
        try {
            status = _main(fullArgs.length, argv);
        } catch(e) {
            if (e instanceof ExitStatus) status = e.status; else throw e;
        }
        status = await hcContinueWhileSuspended(status);
    } finally {
        _free(argv);
        thisProgram = savedProgram;
    }
    return status;
}

// After main() returned: if a checkpoint suspended it, snapshot and resume; repeat
// for every armed checkpoint the run reaches.
async function hcContinueWhileSuspended(status) {
    while (Asyncify.currData && self._hc.pending) {
        var pending = self._hc.pending;
        self._hc.pending = null;
        var snap = hcTakeSnapshot(pending.cp);
        self._hc.checkpoints[snap.id] = snap;
        self._hc.taken.push({ id: snap.id, line: snap.line, bytes: snap.bytes, ms: Math.round(snap.ms), inputs: snap.inputs });
        var done = Asyncify.whenDone();
        try {
            pending.wakeUp(0);
            status = await done;
        } catch(e) {
            if (e instanceof ExitStatus) status = e.status; else throw e;
        }
    }
    return status;
}

// Rewrite the host's main file the way the checkpointed run saw it (preamble padding
// and the semantic-trace injection keep line numbers, so offsets carry over).
function hcTransformMain(text, transform) {
    var out = text;
    if (transform && transform.usedPreamble) {
        var split = extractPreamble(out);
        if (split) {
            var padding = "";
            for (var i = 1; i < transform.preambleLineCount; i++) padding += "%\n";
            out = padding + split.body;
        }
    }
    var bdTag = "\\begin{document}";
    var bdIdx = out.indexOf(bdTag);
    if (bdIdx >= 0) {
        var afterBD = bdIdx + bdTag.length;
        out = out.slice(0, afterBD) + "\\input{__strace}" + out.slice(afterBD);
    }
    return out;
}

// compileheapcheckpoint {id, checkpoints?}: resume the run from a checkpoint on the
// project files as the host last wrote them, and finish like a normal compile.
async function compileFromHeapCheckpointRoutine(data) {
    var routineStart = performance.now();
    var snap = self._hc.checkpoints[data["id"]];
    var phaseTimings = self._activePhaseTimings = {
        formatInstallMs: 0, heapSizeBytes: wasmMemory.buffer.byteLength, heapRestoreMs: 0,
        heapSnapshotBytes: snap ? snap.bytes : 0, heapSnapshotMs: 0, preambleBuildMs: 0,
        preambleExportMs: 0, postProcessMs: 0, texRunMs: 0, workerTotalMs: 0, checkpointResume: true
    };
    if (!snap || !hcSupported()) {
        self.postMessage({ "result": "failed", "status": -1, "log": "no such heap checkpoint", "cmd": "compile" });
        return;
    }
    var restoreStart = performance.now();
    hcRestoreFS(snap.fs);
    var hostMain = self._hc.hostWrites[self.mainfile];
    if (typeof hostMain !== "string") {
        try { hostMain = FS.readFile(WORKROOT + "/" + self.mainfile, { encoding: "utf8" }); } catch(e) { hostMain = ""; }
    }
    FS.writeFile(WORKROOT + "/" + self.mainfile, hcTransformMain(hostMain, snap.transform));
    hcRestoreMemory(snap);
    self.memlog = snap.memlog;
    phaseTimings.heapRestoreMs = performance.now() - restoreStart;
    hcArm(data["checkpoints"], snap.transform);
    // Arms at or before the resume point can never be reached again.
    while (self._hc.armed.length && self._hc.armed[0].offset <= snap.offset) self._hc.armed.shift();
    self._hc.resuming = { node: FS.lookupPath(WORKROOT + "/" + self.mainfile).node };
    var texStart = performance.now();
    var status;
    try {
        Asyncify.state = Asyncify.State.Rewinding;
        Asyncify.currData = snap.currData;
        _asyncify_start_rewind(snap.currData);
        try {
            status = _main();
        } catch(e) {
            if (e instanceof ExitStatus) status = e.status; else throw e;
        }
        status = await hcContinueWhileSuspended(status);
    } catch(e) {
        console.error("[heap-checkpoint] resume crashed: " + e);
        status = -254;
    }
    hcDisarm();
    phaseTimings.texRunMs = performance.now() - texStart;
    FS.writeFile(WORKROOT + "/" + self.mainfile, hostMain);
    finishCompile({ routineStart: routineStart, phaseTimings: phaseTimings, usedPreamble: !!(snap.transform && snap.transform.usedPreamble), preambleRebuilt: false }, status);
}

// The engine binary: the plain build, or the Asyncify build that supports heap
// checkpoints (#81) when the host loaded this worker with `?engine=checkpoint`.
(function() {
    var engine = "wasmtex-pdftex.js";
    try {
        var params = new URLSearchParams(self.location.search);
        if (params.get("engine") === "checkpoint") engine = "wasmtex-pdftex-checkpoint.js";
    } catch(e) {}
    importScripts("wasmtex-kpse-resolve.js", engine);
})();
