import { BaseWorkerEngine as o, resolveTexliveUrl as n } from "./base-worker-engine.js";
import { createEngineWorker as a } from "./worker-host.js";
function l(i) {
  const e = i.errorLog ? `
Engine log:
${i.errorLog}` : "", r = new Error(`${i.errorMessage || "Worker error"}${e}`);
  if (i.errorName && (r.name = i.errorName), i.errorStack) {
    const s = i.errorStack.split(`
`).slice(1).join(`
`);
    r.stack = `${r.name}: ${r.message}${s ? `
${s}` : ""}`;
  }
  return r;
}
class c extends o {
  onFileDownload;
  version;
  constructor(e, r, s) {
    super(e, r), this.version = s;
  }
  async init() {
    this.worker || (this.status = "loading", await new Promise((e, r) => {
      this.worker = a(this.enginePath), this.worker.onmessage = (s) => {
        const t = s.data;
        if (!t.cmd) {
          t.result === "ok" ? (this.status = "ready", e()) : this.failInit(r, new Error("engine failed to initialize"));
          return;
        }
        if (t.cmd === "downloading" && t.file) {
          this.onFileDownload?.(t.file);
          return;
        }
        if (t.cmd === "workererror") {
          this.failInit(r, l(t));
          return;
        }
        this.deliverResponse(`cmd:${t.cmd}`, t);
      }, this.worker.onerror = (s) => {
        this.failInit(r, s);
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
  failInit(e, r) {
    this.worker?.terminate(), this.worker = null, e(this.handleWorkerError(r));
  }
  async writeFile(e, r) {
    this.worker && await this.postMessageWithResponse(
      { cmd: "writefile", url: e, src: r },
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
    const r = await this.postMessageWithResponse({ cmd: "readfile", url: e }, "cmd:readfile");
    return r.result === "ok" ? r.data ?? null : null;
  }
  flushCache() {
    this.worker?.postMessage({ cmd: "flushcache" });
  }
  isReady() {
    return this.status === "ready";
  }
}
class h extends c {
  /** Run `command` (`compilelatex` | `compileformat` | `compilepdf`) and collect
   *  the output. status 0 (ok) and 1 (warnings) both count as success. */
  async run(e) {
    if (this.status !== "ready" || !this.worker)
      return { success: !1, log: "engine not ready", out: null };
    this.status = "compiling";
    const r = await this.postMessageWithResponse({ cmd: e }, "cmd:compile");
    this.status = "ready";
    const s = r.result === "ok" && (r.status === 0 || r.status === 1), t = r.pdf ? new Uint8Array(r.pdf) : null;
    return { success: s, log: r.log || "", out: t };
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
  preloadTexlive(e, r, s) {
    this.worker?.postMessage({ cmd: "preloadtexlive", format: e, filename: r, data: s }, [s]);
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
  c as WasmTexWorker
};
