import { BaseWorkerEngine as o, resolveTexliveUrl as n } from "./base-worker-engine.js";
import { createEngineWorker as a } from "./worker-host.js";
function l(i) {
  const r = i.errorLog ? `
Engine log:
${i.errorLog}` : "", e = new Error(`${i.errorMessage || "Worker error"}${r}`);
  if (i.errorName && (e.name = i.errorName), i.errorStack) {
    const s = i.errorStack.split(`
`).slice(1).join(`
`);
    e.stack = `${e.name}: ${e.message}${s ? `
${s}` : ""}`;
  }
  return e;
}
class u extends o {
  onFileDownload;
  version;
  constructor(r, e, s) {
    super(r, e), this.version = s;
  }
  async init() {
    this.worker || (this.status = "loading", await new Promise((r, e) => {
      this.worker = a(this.enginePath), this.worker.onmessage = (s) => {
        const t = s.data;
        if (!t.cmd) {
          t.result === "ok" ? (this.status = "ready", r()) : this.failInit(e, new Error("engine failed to initialize"));
          return;
        }
        if (t.cmd === "downloading" && t.file) {
          this.onFileDownload?.(t.file);
          return;
        }
        if (t.cmd === "workererror") {
          this.failInit(e, l(t));
          return;
        }
        this.deliverResponse(`cmd:${t.cmd}`, t);
      }, this.worker.onerror = (s) => {
        this.failInit(e, s);
      };
    }), this.worker.postMessage({
      cmd: "settexliveurl",
      url: n(this.texliveUrl, this.version)
    }));
  }
  /** Tear down a worker that failed to initialize and settle any in-flight request. The
   *  worker reference MUST be cleared (only terminate() did this before): otherwise the
   *  `if (this.worker) return` re-entry guard would let a later init() resolve silently
   *  against a dead, errored worker instead of recreating one. */
  failInit(r, e) {
    this.worker?.terminate(), this.worker = null, r(this.handleWorkerError(e));
  }
  async writeFile(r, e) {
    this.worker && await this.postMessageWithResponse(
      { cmd: "writefile", url: r, src: e },
      "cmd:writefile"
    );
  }
  mkdir(r) {
    this.worker?.postMessage({ cmd: "mkdir", url: r });
  }
  setMainFile(r) {
    this.worker?.postMessage({ cmd: "setmainfile", url: r });
  }
  async readFile(r) {
    if (!this.worker) return null;
    const e = await this.postMessageWithResponse({ cmd: "readfile", url: r }, "cmd:readfile");
    return e.result === "ok" ? e.data ?? null : null;
  }
  flushCache() {
    this.worker?.postMessage({ cmd: "flushcache" });
  }
  isReady() {
    return this.status === "ready";
  }
}
class h extends u {
  /** Run `command` (`compilelatex` | `compileformat` | `compilepdf`) and collect
   *  the output. status 0 (ok) and 1 (warnings) both count as success. */
  async run(r) {
    if (this.status !== "ready" || !this.worker)
      return { success: !1, log: "engine not ready", out: null };
    this.status = "compiling";
    const e = await this.postMessageWithResponse({ cmd: r }, "cmd:compile");
    this.status = "ready";
    const s = e.result === "ok" && (e.status === 0 || e.status === 1), t = e.pdf ? new Uint8Array(e.pdf) : null;
    return {
      success: s,
      log: e.log || "",
      out: t,
      ...e.inputFiles ? { inputFiles: e.inputFiles } : {},
      ...typeof e.inputFilesComplete == "boolean" ? { inputFilesComplete: e.inputFilesComplete } : {}
    };
  }
  /** Load the CDN bloom filter so the worker skips sync XHR for definitely-
   *  missing files (fire-and-forget; the worker sends no reply). The buffer is
   *  cloned, NOT transferred — it's tiny (~172 KB) and the engine keeps it to
   *  store in the durable cache; transferring would detach that copy. */
  loadBloom(r) {
    this.worker?.postMessage({ cmd: "loadbloom", data: r });
  }
  /** Inject a prefetched TeX Live file into the worker cache (warmup). Fire-and-
   *  forget: the worker processes messages FIFO, so all preloads land before the
   *  later `compilelatex`; not awaiting a reply keeps a stale worker (one without
   *  this command) from hanging the compile — it just degrades to on-demand XHR.
   *  Transfers buf. */
  preloadTexlive(r, e, s) {
    this.worker?.postMessage({ cmd: "preloadtexlive", format: r, filename: e, data: s }, [s]);
  }
  /** Pre-seed known-missing lookups so the worker skips their sync XHR
   *  (fire-and-forget, same rationale as {@link preloadTexlive}). */
  preload404(r) {
    r.length !== 0 && this.worker?.postMessage({ cmd: "preload404", entries: r });
  }
  /** Export every TeX Live file fetched/preloaded this session, plus known-missing
   *  entries, for the durable cache. */
  async dumpCache() {
    if (!this.worker) return { files: [], notFound: [] };
    const r = await this.postMessageWithResponse({ cmd: "dumpcache" }, "cmd:dumpcache");
    return { files: r.files ?? [], notFound: r.notFound ?? [] };
  }
}
export {
  h as CompileWorkerDriver,
  u as WasmTexWorker
};
