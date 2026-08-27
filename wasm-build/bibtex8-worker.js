/*
 * bibtex8-worker.js — authored Web Worker controller for bibtex8 WASM (#102).
 *
 * Same proven shape as bibtex-worker.js (own glue, kpse_find_file hook for
 * the .bst/.bib lookup, the max_print_line .bbl-wrap workaround, heap snapshot/restore
 * for warm reruns) — just driving _compileBibtex8 instead of _compileBibtex.
 */
"use strict";

var TEXCACHEROOT = "/tex";
var WORKROOT = "/work";

var texlive200_cache = {};
var texlive404_cache = {};

var Module = self.Module = {};
if (self.__wasmtexWasmBinary) Module["wasmBinary"] = self.__wasmtexWasmBinary;

Module["print"] = function(a) {
  self.memlog += a + "\n";
  console.log("[bibtex8] " + a);
};

Module["printErr"] = function(a) {
  self.memlog += a + "\n";
  console.warn("[bibtex8-err] " + a);
};

Module["preRun"] = function() {
  FS.mkdir(TEXCACHEROOT);
  FS.mkdir(WORKROOT);
  FS.chdir(WORKROOT);
};

Module["postRun"] = function() {
  self.initmem = dumpHeapMemory();
  self.postMessage({ "result": "ok" });
};

Module["noExitRuntime"] = true;

self.memlog = "";
self.texlive_endpoint = "";
self.mainfile = "main";

function dumpHeapMemory() {
  return new Uint8Array(wasmMemory.buffer).slice();
}

function restoreHeapMemory() {
  var dst = new Uint8Array(wasmMemory.buffer);
  dst.set(self.initmem);
  if (dst.length > self.initmem.length) {
    dst.fill(0, self.initmem.length);
  }
}

function allocateString(str) {
  var encoder = new TextEncoder();
  var bytes = encoder.encode(str);
  var ptr = _malloc(bytes.length + 1);
  var heap = new Uint8Array(wasmMemory.buffer);
  heap.set(bytes, ptr);
  heap[ptr + bytes.length] = 0;
  return ptr;
}

function kpse_find_file_impl(nameptr, format, _mustexist) {
  var reqname = UTF8ToString(nameptr);
  console.log("[bibtex8-kpse] REQUESTED: " + reqname + " (format: " + format + ")");

  if (reqname.startsWith("*") || reqname.startsWith("&")) {
    reqname = reqname.substring(1);
  }
  if (reqname.includes("/")) return 0;

  try {
    var localPath = WORKROOT + "/" + reqname;
    if (FS.analyzePath(localPath).exists) return allocateString(localPath);
  } catch (e) {}

  var cacheKey = format + "/" + reqname;
  if (texlive200_cache[cacheKey]) return allocateString(texlive200_cache[cacheKey]);
  if (texlive404_cache[cacheKey]) return 0;

  function tryFetch(name) {
    var url = self.texlive_endpoint + "pdftex/" + format + "/" + name;
    self.postMessage({ "cmd": "downloading", "file": name });
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, false);
    xhr.timeout = 30000;
    xhr.responseType = "arraybuffer";
    try { xhr.send(); return xhr; } catch (err) { return null; }
  }

  var xhr = tryFetch(reqname);

  // Missing-object status varies by mirror — retry on any >=400.
  if (xhr && xhr.status >= 400) {
    if (reqname.includes(".")) {
      var bare = reqname.substring(0, reqname.lastIndexOf("."));
      var retryXhr = tryFetch(bare);
      if (retryXhr && retryXhr.status === 200) { xhr = retryXhr; reqname = bare; }
    }
    if (xhr.status >= 400) {
      var exts = [];
      if (format === 26) exts = [".tex", ".sty", ".cls"];
      if (format === 6) exts = [".bib"];
      if (format === 7) exts = [".bst"];
      for (var i = 0; i < exts.length; i++) {
        if (reqname.endsWith(exts[i])) continue;
        var rx = tryFetch(reqname + exts[i]);
        if (rx && rx.status === 200) { xhr = rx; reqname += exts[i]; break; }
      }
    }
  }

  if (xhr && xhr.status === 200) {
    var data = new Uint8Array(xhr.response);
    var savepath = TEXCACHEROOT + "/" + reqname;
    FS.writeFile(savepath, data);
    texlive200_cache[cacheKey] = savepath;
    return allocateString(savepath);
  }

  texlive404_cache[cacheKey] = true;
  return 0;
}

function writeTexmfCnf() {
  // See bibtex-worker.js: cap .bbl wrap well above any real .bst banner
  // but below buf_size to avoid BibTeX's sanity-check abort.
  var cnf = [
    "BIBINPUTS = .;" + TEXCACHEROOT + "//",
    "BSTINPUTS = .;" + TEXCACHEROOT + "//",
    "TEXINPUTS = .;" + TEXCACHEROOT + "//",
    "max_print_line = 1000",
    ""
  ].join("\n");
  FS.writeFile(WORKROOT + "/texmf.cnf", cnf);
}

function compileBibtex8Routine() {
  console.log("[bibtex8] Starting compilation for: " + self.mainfile);
  self.memlog = "";
  restoreHeapMemory();

  var keys = Object.keys(FS.streams);
  for (var i = 0; i < keys.length; i++) {
    var fd = parseInt(keys[i]);
    if (fd > 2 && FS.streams[fd]) {
      try { FS.close(FS.streams[fd]); } catch (e) {}
    }
  }

  try { FS.writeFile(WORKROOT + "/bibtex8", ""); } catch (e) {}
  writeTexmfCnf();

  _setMainEntry(allocateString(self.mainfile));

  var status = 2;
  try {
    status = _compileBibtex8();
  } catch (e) {
    if (typeof ExitStatus !== "undefined" && e instanceof ExitStatus) {
      status = e.status;
    } else {
      console.error("[bibtex8] Crash: " + e);
    }
  }

  console.log("[bibtex8] Finished with status: " + status);
  self.postMessage({
    "cmd": "compile",
    "result": status <= 1 ? "ok" : "error",
    "log": self.memlog
  });
}

function readFileRoutine(url) {
  try {
    var data = FS.readFile(WORKROOT + "/" + url, { encoding: "utf8" });
    self.postMessage({ "cmd": "readfile", "result": "ok", "data": data });
  } catch (e) {
    self.postMessage({ "cmd": "readfile", "result": "error", "data": null });
  }
}

self["onmessage"] = function(ev) {
  var data = ev.data;
  var cmd = data["cmd"];

  if (cmd === "compilebibtex8") {
    self.mainfile = data.url || "main";
    compileBibtex8Routine();
  } else if (cmd === "writefile") {
    try {
      FS.writeFile(WORKROOT + "/" + data.url, data.src);
      self.postMessage({ "result": "ok", "cmd": "writefile" });
    } catch (e) {
      var parts = data.url.split("/");
      var dir = WORKROOT;
      for (var i = 0; i < parts.length - 1; i++) {
        dir += "/" + parts[i];
        try { FS.mkdir(dir); } catch (e2) {}
      }
      try {
        FS.writeFile(WORKROOT + "/" + data.url, data.src);
        self.postMessage({ "result": "ok", "cmd": "writefile" });
      } catch (e3) {
        self.postMessage({ "result": "failed", "cmd": "writefile" });
      }
    }
  } else if (cmd === "mkdir") {
    try {
      FS.mkdir(WORKROOT + "/" + data.url);
      self.postMessage({ "result": "ok", "cmd": "mkdir" });
    } catch (e) {
      self.postMessage({ "result": "failed", "cmd": "mkdir" });
    }
  } else if (cmd === "readfile") {
    readFileRoutine(data.url);
  } else if (cmd === "settexliveurl") {
    self.texlive_endpoint = data.url;
  }
};

self.kpse_find_file_impl = kpse_find_file_impl;
importScripts("wasmtex-bibtex8.js");
