import { BaseWorkerEngine as o, resolveTexliveUrl as a } from "./base-worker-engine.js";
import { createEngineWorker as n } from "./worker-host.js";
class l extends o {
  onFileDownload;
  version;
  constructor(e, s, r) {
    super(e, s), this.version = r;
  }
  async init() {
    this.worker || (this.status = "loading", await new Promise((e, s) => {
      this.worker = n(this.enginePath), this.worker.onmessage = (r) => {
        const t = r.data;
        if (!t.cmd) {
          t.result === "ok" ? (this.status = "ready", e()) : this.failInit(s, new Error("engine failed to initialize"));
          return;
        }
        if (t.cmd === "downloading" && t.file) {
          this.onFileDownload?.(t.file);
          return;
        }
        this.deliverResponse(`cmd:${t.cmd}`, t);
      }, this.worker.onerror = (r) => {
        this.failInit(s, r instanceof Error ? r : new Error("Worker error"));
      };
    }), this.worker.postMessage({
      cmd: "settexliveurl",
      url: a(this.texliveUrl, this.version)
    }));
  }
  /** Tear down a worker that failed to initialize and settle any in-flight request. The
   *  worker reference MUST be cleared (only terminate() did this before): otherwise the
   *  `if (this.worker) return` re-entry guard would let a later init() resolve silently
   *  against a dead, errored worker instead of recreating one. */
  failInit(e, s) {
    this.worker?.terminate(), this.worker = null, e(this.handleWorkerError(s));
  }
  async writeFile(e, s) {
    this.worker && await this.postMessageWithResponse(
      { cmd: "writefile", url: e, src: s },
      "cmd:writefile"
    );
  }
  mkdir(e) {
    this.worker?.postMessage({ cmd: "mkdir", url: e });
  }
  setMainFile(e) {
    this.worker?.postMessage({ cmd: "setmainfile", url: e });
  }
  async readFile(e) {
    if (!this.worker) return null;
    const s = await this.postMessageWithResponse({ cmd: "readfile", url: e }, "cmd:readfile");
    return s.result === "ok" ? s.data ?? null : null;
  }
  flushCache() {
    this.worker?.postMessage({ cmd: "flushcache" });
  }
  isReady() {
    return this.status === "ready";
  }
}
class h extends l {
  /** Run `command` (`compilelatex` | `compileformat` | `compilepdf`) and collect
   *  the output. status 0 (ok) and 1 (warnings) both count as success. */
  async run(e) {
    if (this.status !== "ready" || !this.worker)
      return { success: !1, log: "engine not ready", out: null };
    this.status = "compiling";
    const s = await this.postMessageWithResponse({ cmd: e }, "cmd:compile");
    this.status = "ready";
    const r = s.result === "ok" && (s.status === 0 || s.status === 1), t = s.pdf ? new Uint8Array(s.pdf) : null;
    return { success: r, log: s.log || "", out: t };
  }
  /** Load the CDN bloom filter so the worker skips sync XHR for definitely-
   *  missing files (fire-and-forget; the worker sends no reply). The buffer is
   *  cloned, NOT transferred — it's tiny (~172 KB) and the engine keeps it to
   *  store in the durable cache; transferring would detach that copy. */
  loadBloom(e) {
    this.worker?.postMessage({ cmd: "loadbloom", data: e });
  }
  /** Inject a prefetched TeX Live file into the worker cache (warmup). Fire-and-
   *  forget: the worker processes messages FIFO, so all preloads land before the
   *  later `compilelatex`; not awaiting a reply keeps a stale worker (one without
   *  this command) from hanging the compile — it just degrades to on-demand XHR.
   *  Transfers buf. */
  preloadTexlive(e, s, r) {
    this.worker?.postMessage({ cmd: "preloadtexlive", format: e, filename: s, data: r }, [r]);
  }
  /** Pre-seed known-missing lookups so the worker skips their sync XHR
   *  (fire-and-forget, same rationale as {@link preloadTexlive}). */
  preload404(e) {
    e.length !== 0 && this.worker?.postMessage({ cmd: "preload404", entries: e });
  }
  /** Export every TeX Live file fetched/preloaded this session, plus known-missing
   *  entries, for the durable cache. */
  async dumpCache() {
    if (!this.worker) return { files: [], notFound: [] };
    const e = await this.postMessageWithResponse({ cmd: "dumpcache" }, "cmd:dumpcache");
    return { files: e.files ?? [], notFound: e.notFound ?? [] };
  }
}
export {
  h as CompileWorkerDriver,
  l as WasmTexWorker
};
