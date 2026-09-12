#include <emscripten.h>
#include <zlib.h>
#include <string.h>
/* One byte-verified format, bounded decoded read sequence. TeX format streams
 * use gzdopen/gzread/gzclose; no upstream layout, validation, or FS bytes change.
 * Cache chunks precede TeX byte swapping. Only JS-owned bytes survive heap reset.
 * On a different read request, resume native gzip at the already-served offset.
 * Bounds: one <=8 MiB source, <=32 MiB decoded data, <=65536 read chunks.
 * Worker flushcache drops this state; an engine transition replaces the worker.
 * See docs/engine-optimization-policy.md and tests/fmt-cache-probe.cjs.
 */
EM_JS(void, fmt_begin, (int handle, int fd), {
  var state = Module.fmtDecodeCache || (Module.fmtDecodeCache = { saved: null, active: null, hits: 0 });
  if (state.active) return;
  var stream = FS.getStream(fd);
  if (!stream || stream.position !== 0 || typeof stream.path !== 'string' || !stream.path.endsWith('.fmt')) return;
  var bytes;
  try {
    if (FS.stat(stream.path).size > 8388608) { state.saved = null; return; }
    bytes = FS.readFile(stream.path);
  } catch (e) { return; }
  var saved = state.saved;
  var same = saved && saved.source.length === bytes.length;
  if (same) for (var i=0;i<bytes.length;i++) if (saved.source[i] !== bytes[i]) { same=false; break; }
  if (!same) state.saved = null;
  state.active = { handle:handle, source:same?saved.source:bytes, entries:[], total:0, index:0, saved:same?saved:null };
});
EM_JS(int, fmt_read, (int handle, int dest, int length), {
  var s=Module.fmtDecodeCache, a=s && s.active;
  if (!a || a.handle !== handle) return -1;
  var e=a.saved && a.saved.entries[a.index];
  if (!e || e.length !== length) return -1;
  HEAPU8.set(e, dest); a.index++; a.total+=length; s.hits++; return length;
});
EM_JS(int, fmt_position, (int handle), {
  var s=Module.fmtDecodeCache, a=s && s.active;
  return a && a.handle===handle && a.saved ? a.total : -1;
});
EM_JS(void, fmt_fallback, (int handle), {
  var s=Module.fmtDecodeCache, a=s && s.active;
  if (a && a.handle===handle && a.saved) { s.active=null; }
});
EM_JS(void, fmt_record, (int handle, int src, int length, int got), {
  var s=Module.fmtDecodeCache, a=s && s.active;
  if (!a || a.handle!==handle || a.saved) return;
  if (got < 0 || length < 0 || length!==got || a.total+got>33554432 || a.entries.length>=65536) { s.active=null; return; }
  a.entries.push(HEAPU8.slice(src, src+got)); a.total+=got;
});
EM_JS(void, fmt_end, (int handle, int result), {
  var s=Module.fmtDecodeCache, a=s && s.active;
  if (!a || a.handle!==handle) return;
  if (result === 0 && !a.saved && a.entries.length) s.saved={source:a.source, entries:a.entries};
  s.active=null;
});
extern gzFile __real_gzdopen(int,const char*);
extern int __real_gzread(gzFile,void*,unsigned);
extern int __real_gzclose(gzFile);
gzFile __wrap_gzdopen(int fd,const char *mode) {
  gzFile f=__real_gzdopen(fd,mode);
  if(f && strchr(mode,'r')) fmt_begin((int)f,fd);
  return f;
}
int __wrap_gzread(gzFile f,void *p,unsigned n) {
  int cached=fmt_read((int)f,(int)p,n);
  if(cached>=0) return cached;
  int pos=fmt_position((int)f);
  if(pos>=0) { gzseek(f,pos,SEEK_SET); fmt_fallback((int)f); }
  int got=__real_gzread(f,p,n);
  fmt_record((int)f,(int)p,n,got);
  return got;
}
int __wrap_gzclose(gzFile f) {
  int result = __real_gzclose(f);
  fmt_end((int)f, result);
  return result;
}
