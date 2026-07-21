/*
 * makeindex-worker.js — authored Web Worker controller for makeindex WASM (#101).
 *
 * Same shape as bibtex-worker.js: own glue, the kpse_find_file hook for
 * the (optional) -s style `.ist` lookup, heap snapshot/restore for warm reruns.
 * makeindex reads <base>.idx from MEMFS and writes <base>.ind + <base>.ilg.
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
  console.log("[makeindex] " + a);
};

Module["printErr"] = function(a) {
  self.memlog += a + "\n";
  console.warn("[makeindex-err] " + a);
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

// kpse hook — only exercised when the document passes a custom `-s style.ist`.
// The common `\printindex` (default style) reads/writes purely local files.
function kpse_find_file_impl(nameptr, format, _mustexist) {
  var reqname = UTF8ToString(nameptr);
  console.log("[makeindex-kpse] REQUESTED: " + reqname + " (format: " + format + ")");

  if (reqname.startsWith("*") || reqname.startsWith("&")) {
    reqname = reqname.substring(1);
  }
  if (reqname.includes("/")) return 0;

  // PRIORITY 1: Local VFS
  try {
    var localPath = WORKROOT + "/" + reqname;
    if (FS.analyzePath(localPath).exists) {
      return allocateString(localPath);
    }
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
  // CloudFront answers a missing key with 403 (not 404); retry the bare name.
  if (xhr && xhr.status >= 400 && reqname.includes(".")) {
    var bare = reqname.substring(0, reqname.lastIndexOf("."));
    var retryXhr = tryFetch(bare);
    if (retryXhr && retryXhr.status === 200) { xhr = retryXhr; reqname = bare; }
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
  var cnf = [
    "INDEXSTYLE = .;" + TEXCACHEROOT + "//",
    "TEXINPUTS = .;" + TEXCACHEROOT + "//",
    ""
  ].join("\n");
  FS.writeFile(WORKROOT + "/texmf.cnf", cnf);
}

function compileMakeindexRoutine() {
  console.log("[makeindex] Starting for: " + self.mainfile);
  self.memlog = "";
  restoreHeapMemory();

  var keys = Object.keys(FS.streams);
  for (var i = 0; i < keys.length; i++) {
    var fd = parseInt(keys[i]);
    if (fd > 2 && FS.streams[fd]) {
      try { FS.close(FS.streams[fd]); } catch (e) {}
    }
  }

  writeTexmfCnf();
  _setMainEntry(allocateString(self.mainfile));

  var status = 2;
  try {
    status = _compileMakeindex();
  } catch (e) {
    if (typeof ExitStatus !== "undefined" && e instanceof ExitStatus) {
      status = e.status;
    } else {
      console.error("[makeindex] Crash: " + e);
    }
  }

  console.log("[makeindex] Finished with status: " + status);
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

  if (cmd === "compilemakeindex") {
    self.mainfile = data.url || "main";
    compileMakeindexRoutine();
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
importScripts("wasmtex-makeindex.js");
