/* =============================================================================
 * fontconfig-shim.h — WasmTex's OWN minimal fontconfig API for XeTeX (WASM) [#52]
 * =============================================================================
 *
 * Drop-in for `<fontconfig/fontconfig.h>` when building XeTeX from texlive-source
 * under emscripten, where there is no system fontconfig. It declares ONLY the slice
 * of the fontconfig API that XeTeX's (unpatched) XeTeXFontMgr_FC.{cpp,h} uses, so the
 * upstream font manager compiles unchanged. fontconfig-shim.c implements these by
 * reading the prebuilt `xetexfontlist.txt` (the by-name font DB on the CDN) instead
 * of scanning the filesystem.
 *
 * Names/types/constants mirror fontconfig's public API (an interface), so the
 * unpatched XeTeXFontMgr_FC.cpp links against them. Built into the include path as
 * `fontconfig/fontconfig.h` by build-xetex2.sh.
 * ========================================================================== */
#ifndef WASMTEX_FONTCONFIG_SHIM_H
#define WASMTEX_FONTCONFIG_SHIM_H

#include <stdarg.h>

typedef unsigned char FcChar8;
typedef unsigned short FcChar16;
typedef unsigned int FcChar32;
typedef int FcBool;

#define FcFalse 0
#define FcTrue 1

/* Compile-time fontconfig version (XeTeX_ext.c checks FcGetVersion() vs FC_VERSION). */
#define FC_MAJOR 2
#define FC_MINOR 13
#define FC_REVISION 0
#define FC_VERSION ((FC_MAJOR * 10000) + (FC_MINOR * 100) + FC_REVISION)

/* Object names XeTeX queries (FcPatternGet*). */
#define FC_FAMILY "family"     /* String */
#define FC_STYLE "style"       /* String */
#define FC_SLANT "slant"       /* Int */
#define FC_WEIGHT "weight"     /* Int */
#define FC_WIDTH "width"       /* Int */
#define FC_FILE "file"         /* String */
#define FC_INDEX "index"       /* Int */
#define FC_FULLNAME "fullname" /* String */
#define FC_FONTFORMAT "fontformat"

typedef enum _FcResult {
  FcResultMatch,
  FcResultNoMatch,
  FcResultTypeMismatch,
  FcResultNoId,
  FcResultOutOfMemory
} FcResult;

/* Opaque to XeTeX (used only via the getters below + as std::map keys by identity). */
typedef struct _FcPattern FcPattern;
typedef struct _FcConfig FcConfig;

typedef struct _FcFontSet {
  int nfont;
  int sfont;
  FcPattern **fonts;
} FcFontSet;

typedef struct _FcObjectSet {
  int nobject;
  int sobject;
  const char **objects;
} FcObjectSet;

#ifdef __cplusplus
extern "C" {
#endif

FcBool FcInit(void);
int FcGetVersion(void);
FcPattern *FcNameParse(const FcChar8 *name);
FcObjectSet *FcObjectSetBuild(const char *first, ...);
void FcObjectSetDestroy(FcObjectSet *os);
void FcPatternDestroy(FcPattern *p);
FcConfig *FcConfigGetCurrent(void);
FcFontSet *FcFontList(FcConfig *config, FcPattern *p, FcObjectSet *os);
FcResult FcPatternGetString(const FcPattern *p, const char *object, int n, FcChar8 **s);
FcResult FcPatternGetInteger(const FcPattern *p, const char *object, int n, int *i);

#ifdef __cplusplus
}
#endif

#endif /* WASMTEX_FONTCONFIG_SHIM_H */
