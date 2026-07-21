/* =============================================================================
 * library.js — Emscripten JS library providing kpathsea→JS bridge functions
 * =============================================================================
 *
 * These functions are called from C code (via --wrap linker flag) when
 * kpathsea can't find a file locally in MEMFS. They delegate to the
 * kpse_find_file_impl/kpse_find_pk_impl functions defined in the authored worker
 * controller, which fetch files from the TeX Live server via XHR.
 *
 * Used with: emcc --js-library library.js
 * ========================================================================== */

mergeInto(LibraryManager.library, {
  kpse_find_file_js: function(nameptr, format, mustexist) {
    return kpse_find_file_impl(nameptr, format, mustexist);
  },
  kpse_find_file_js__sig: 'iiii',

  kpse_find_pk_js: function(nameptr, dpi) {
    return kpse_find_pk_impl(nameptr, dpi);
  },
  kpse_find_pk_js__sig: 'iii'
});
