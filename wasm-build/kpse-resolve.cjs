// Pure kpathsea-name resolution helpers, shared by the WASM worker and unit
// tests. Loaded by pdftex-worker.js before the generated Emscripten module, so
// these become globals the controller can call; the CommonJS export at the bottom (a
// no-op in the worker, where `module` is undefined) lets tests require them.
//
// Why this exists: the CDN bucket and its bloom filter are keyed by the file's
// stored name, but kpathsea looks files up under names that differ by extension
// (it requests virtual fonts as "ptmb7t.vf" where the bucket stores "ptmb7t",
// and \input/source files bare as "xkeyval" where the bucket stores
// "xkeyval.tex"). The worker must reconcile those namespaces.

// Extensions the XHR fallback appends for a given kpathsea format id.
function retryExtensions(format) {
    if (format === 26) return [".tex", ".sty", ".cls", ".def", ".cfg", ".ltx"];
    if (format === 3) return [".tfm"];
    if (format === 33) return [".vf"];
    if (format === 7) return [".bst"];
    return [];
}

// Every bucket key the fallback could end up fetching for a request, i.e. the
// names the bloom filter must be checked against before skipping the XHR: the
// exact request, the extension-stripped form, and each appended format
// extension. If none of these is in the bloom the file is genuinely absent.
function bloomCandidates(format, reqname) {
    var keys = [format + "/" + reqname];
    if (reqname.indexOf(".") >= 0) {
        keys.push(format + "/" + reqname.substring(0, reqname.lastIndexOf(".")));
    }
    var exts = retryExtensions(format);
    for (var i = 0; i < exts.length; i++) {
        if (!reqname.endsWith(exts[i])) {
            keys.push(format + "/" + reqname + exts[i]);
        }
    }
    return keys;
}

// The bucket names the fallback should actually fetch, in order, for a
// request: the exact name, the extension-stripped form, then each appended
// format extension — but only those the bloom filter does not rule out. Without
// a bloom filter (`mayExist` is null) every candidate is kept, as before.
//
// Why per-candidate filtering matters: kpathsea asks for "ptmb7t.vf" while the
// bucket stores "33/ptmb7t", so fetching the exact name first was one guaranteed
// 404 per virtual or metric font; and a genuinely missing config file used to
// cost up to seven 404s (the name, the stripped name, and every extension) as
// soon as any one of those keys collided with the bloom filter. Each 404 is a
// full origin round trip when the edge has not cached it yet.
function fetchCandidates(format, reqname, mayExist) {
    var names = [reqname];
    if (reqname.indexOf(".") >= 0) {
        names.push(reqname.substring(0, reqname.lastIndexOf(".")));
    }
    var exts = retryExtensions(format);
    for (var i = 0; i < exts.length; i++) {
        if (!reqname.endsWith(exts[i])) names.push(reqname + exts[i]);
    }
    if (typeof mayExist !== "function") return names;
    var kept = [];
    for (var j = 0; j < names.length; j++) {
        if (mayExist(format + "/" + names[j])) kept.push(names[j]);
    }
    return kept;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { retryExtensions, bloomCandidates, fetchCandidates };
}
