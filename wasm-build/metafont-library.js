/* =============================================================================
 * metafont-library.js — Emscripten JS library for Metafont and GFtoPK
 * =============================================================================
 *
 * Linked via `emcc --js-library`. Each tool is a module of its own that lives for one
 * font, so it asks the instance's own `findFile` rather than a worker global.
 * ========================================================================== */

mergeInto(LibraryManager.library, {
  kpse_find_file_js__deps: ['$stringToNewUTF8'],
  kpse_find_file_js: (nameptr, format, _mustexist) => {
    const path = Module.findFile?.(Module, UTF8ToString(nameptr), format)
    return path ? stringToNewUTF8(path) : 0
  },
  kpse_find_file_js__sig: 'iiii',
})
