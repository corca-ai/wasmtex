/* =============================================================================
 * xetex-library.js — Emscripten JS library for the XeTeX engine
 * =============================================================================
 *
 * Linked via `emcc --js-library`. Bridges the C-side kpse/font lookups to the
 * implementations in the separately loaded xetex-worker.js controller.
 * ========================================================================== */

mergeInto(LibraryManager.library, {
  kpse_find_file_js: (nameptr, format, mustexist) =>
    kpse_find_file_impl(nameptr, format, mustexist),
  kpse_find_file_js__sig: 'iiii',

  fontconfig_search_font_js: (nameptr, varptr) => fontconfig_search_font_impl(nameptr, varptr),
  fontconfig_search_font_js__sig: 'iii',
})
