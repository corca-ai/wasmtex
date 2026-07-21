/* =============================================================================
 * xetex-dvipdfm-library.js — Emscripten JS library for dvipdfmx
 * =============================================================================
 *
 * Linked via `emcc --js-library`. Bridges dvipdfmx's C-side kpse lookup to the
 * implementation in the separately loaded dvipdfm-worker.js controller.
 *
 * The from-texlive-source dvipdfmx routes lookups through kpse-hook.c's
 * __wrap_kpse_find_file, which calls kpse_find_file_js(name, format, must_exist) —
 * THREE args ('iiii'), matching xetex-library.js. A 2-arg 'iii' signature causes
 * a wasm import-signature LinkError here.
 * kpse_find_file_impl ignores the extra must_exist arg.
 * ========================================================================== */

mergeInto(LibraryManager.library, {
  kpse_find_file_js: (nameptr, format, mustexist) => kpse_find_file_impl(nameptr, format, mustexist),
  kpse_find_file_js__sig: 'iiii',
})
