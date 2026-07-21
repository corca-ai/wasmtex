/* =============================================================================
 * icu-data-loader.c — register runtime-fetched ICU data  [#52 M4b]
 * =============================================================================
 *
 * emscripten's `-sUSE_ICU` links `libicu_stubdata`: ICU with NO converter/locale
 * data. XeTeX's font manager (XeTeXFontMgr_FC::initialize) calls
 * ucnv_open("macintosh"), which needs real data — so unpatched upstream XeTeX
 * fails with "internal error; cannot read font names".
 *
 * Rather than bake the ~28MB ICU data into the wasm (10x the engine size), the
 * worker glue fetches `icudt68l.dat` (an engine asset, next to the .wasm) at init
 * and hands the bytes here; udata_setCommonData() registers them as ICU's common
 * data BEFORE any ICU use. Called once from Module.preRun (so the registration +
 * buffer land in the heap snapshot and survive restoreHeapMemory between compiles).
 *
 * `data` must remain valid for ICU's lifetime — the glue keeps the malloc'd buffer
 * (it's captured in initmem). Returns the UErrorCode (0 == U_ZERO_ERROR == OK).
 * ========================================================================== */
#include <unicode/udata.h>
#include <unicode/utypes.h>

int set_icu_common_data(void *data) {
  UErrorCode err = U_ZERO_ERROR;
  udata_setCommonData(data, &err);
  return (int)err;
}
