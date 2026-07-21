/* =============================================================================
 * fontconfig-shim.c — WasmTex's OWN fontconfig + FT_New_Face shims for XeTeX [#52]
 * =============================================================================
 *
 * Implements the slice of fontconfig that XeTeX's unpatched XeTeXFontMgr_FC.cpp
 * calls (see fontconfig-shim.h), backed by the prebuilt `xetexfontlist.txt` font DB
 * instead of scanning the filesystem (impossible under the on-demand WASM model).
 *
 *   FcFontList()  → fetch xetexfontlist.txt via kpse (→ CDN dir 26) and parse it into
 *                   an FcFontSet, one FcPattern per font (file/index/family/style/
 *                   fullname/weight/width/slant). XeTeX matches by name over this set.
 *   FcPatternGet* → read those fields back.
 *
 * Plus an FT_New_Face interpose (`-Wl,--wrap=FT_New_Face`): the font manager opens the
 * matched font with FT_New_Face(basename) — kpse-fetch the basename to a local MEMFS
 * path first (→ CDN dir 47/36/32 by extension), then open. Keeps XeTeXFontMgr_FC.cpp,
 * XeTeXFontInst.cpp, etc. unpatched (interpose, don't patch).
 *
 * xetexfontlist.txt format (one field per line) — see scripts/gen-xetexfontlist.mjs:
 *   fontId / file / index / N family… / N style… / N fullname… / psName / subFamily /
 *   weight / width / slant / isReg / isBold / isItalic / designSize / minSize /
 *   maxSize / subFamilyID / subFamilyID(dup)
 * ========================================================================== */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "fontconfig-shim.h"

/* Minimal kpathsea surface (declared locally to avoid header coupling). The format
 * ordinals are kpathsea's stable ABI — and also our CDN dir ids. kpse_find_file is
 * wrapped (-Wl,--wrap=kpse_find_file) to fall back to the CDN over HTTP. */
extern char *kpse_find_file(const char *name, int format, int must_exist);
enum {
  KPSE_TEX_FORMAT = 26,
  KPSE_TYPE1_FORMAT = 32,
  KPSE_TRUETYPE_FORMAT = 36,
  KPSE_OPENTYPE_FORMAT = 47
};

struct _FcPattern {
  char *file;
  int index;
  char **family;
  int nfamily;
  char **style;
  int nstyle;
  char **full;
  int nfull;
  int weight, width, slant;
  int has_metrics;
};
struct _FcConfig {
  int dummy;
};

static FcFontSet g_fontset = {0, 0, NULL};
static int g_loaded = 0;
static struct _FcConfig g_config;

/* ---- xetexfontlist.txt parsing --------------------------------------------- */

/* Slurp a kpse-resolved file into a malloc'd NUL-terminated buffer, or NULL. */
static char *slurp_kpse(const char *name, int format) {
  char *path = kpse_find_file(name, format, 1);
  if (!path) return NULL;
  FILE *f = fopen(path, "rb");
  if (!f) return NULL;
  fseek(f, 0, SEEK_END);
  long n = ftell(f);
  fseek(f, 0, SEEK_SET);
  if (n < 0) {
    fclose(f);
    return NULL;
  }
  char *buf = (char *)malloc((size_t)n + 1);
  if (!buf) {
    fclose(f);
    return NULL;
  }
  size_t got = fread(buf, 1, (size_t)n, f);
  fclose(f);
  buf[got] = '\0';
  return buf;
}

/* Line iterator over the slurped buffer: returns the next line (NUL-terminated in
 * place, trailing \r stripped) and advances *cur, or NULL at end. */
static char *next_line(char **cur) {
  char *s = *cur;
  if (!s || *s == '\0') return NULL;
  char *nl = strchr(s, '\n');
  if (nl) {
    *nl = '\0';
    *cur = nl + 1;
  } else {
    *cur = s + strlen(s);
  }
  size_t len = strlen(s);
  if (len > 0 && s[len - 1] == '\r') s[len - 1] = '\0';
  return s;
}

/* Read `count` lines into a freshly-allocated array of strdup'd strings. */
static char **read_list(char **cur, int count) {
  if (count <= 0) return NULL;
  char **arr = (char **)calloc((size_t)count, sizeof(char *));
  for (int i = 0; i < count; i++) {
    char *l = next_line(cur);
    arr[i] = strdup(l ? l : "");
  }
  return arr;
}

static int read_int(char **cur) {
  char *l = next_line(cur);
  return l ? atoi(l) : 0;
}

static void load_fontlist(void) {
  g_loaded = 1;
  char *buf = slurp_kpse("xetexfontlist.txt", KPSE_TEX_FORMAT);
  if (!buf) return;

  int cap = 256, n = 0;
  FcPattern **fonts = (FcPattern **)malloc((size_t)cap * sizeof(FcPattern *));
  char *cur = buf;

  while (cur && *cur) {
    char *fontId = next_line(&cur); /* skip */
    if (!fontId) break;
    char *file = next_line(&cur);
    if (!file) break;
    FcPattern *p = (FcPattern *)calloc(1, sizeof(FcPattern));
    p->file = strdup(file);
    p->index = read_int(&cur);
    p->nfamily = read_int(&cur);
    p->family = read_list(&cur, p->nfamily);
    p->nstyle = read_int(&cur);
    p->style = read_list(&cur, p->nstyle);
    p->nfull = read_int(&cur);
    p->full = read_list(&cur, p->nfull);
    next_line(&cur); /* psName (XeTeX reads it from FreeType) */
    next_line(&cur); /* subFamily */
    p->weight = read_int(&cur);
    p->width = read_int(&cur);
    p->slant = read_int(&cur);
    p->has_metrics = 1;
    next_line(&cur); /* isReg */
    next_line(&cur); /* isBold */
    next_line(&cur); /* isItalic */
    next_line(&cur); /* designSize */
    next_line(&cur); /* minSize */
    next_line(&cur); /* maxSize */
    next_line(&cur); /* subFamilyID */
    next_line(&cur); /* subFamilyID (dup — upstream parser reads it twice) */

    if (n == cap) {
      cap *= 2;
      fonts = (FcPattern **)realloc(fonts, (size_t)cap * sizeof(FcPattern *));
    }
    fonts[n++] = p;
  }
  free(buf);
  g_fontset.fonts = fonts;
  g_fontset.nfont = n;
  g_fontset.sfont = cap;
}

/* ---- fontconfig API surface ------------------------------------------------ */

FcBool FcInit(void) { return FcTrue; }
int FcGetVersion(void) { return FC_VERSION; }

/* The query pattern / object set are only created, passed to FcFontList (ignored —
 * we return ALL outline fonts), then destroyed. Return distinct heap sentinels. */
FcPattern *FcNameParse(const FcChar8 *name) {
  (void)name;
  return (FcPattern *)calloc(1, sizeof(FcPattern));
}
FcObjectSet *FcObjectSetBuild(const char *first, ...) {
  (void)first;
  return (FcObjectSet *)calloc(1, sizeof(FcObjectSet));
}
void FcObjectSetDestroy(FcObjectSet *os) { free(os); }
void FcPatternDestroy(FcPattern *p) { free(p); } /* only ever the query sentinel */
FcConfig *FcConfigGetCurrent(void) { return &g_config; }

FcFontSet *FcFontList(FcConfig *config, FcPattern *p, FcObjectSet *os) {
  (void)config;
  (void)p;
  (void)os;
  if (!g_loaded) load_fontlist();
  return &g_fontset;
}

FcResult FcPatternGetString(const FcPattern *p, const char *object, int n, FcChar8 **s) {
  if (!p || !object) return FcResultNoMatch;
  if (strcmp(object, FC_FILE) == 0) {
    if (n == 0 && p->file) {
      *s = (FcChar8 *)p->file;
      return FcResultMatch;
    }
  } else if (strcmp(object, FC_FAMILY) == 0) {
    if (n >= 0 && n < p->nfamily) {
      *s = (FcChar8 *)p->family[n];
      return FcResultMatch;
    }
  } else if (strcmp(object, FC_STYLE) == 0) {
    if (n >= 0 && n < p->nstyle) {
      *s = (FcChar8 *)p->style[n];
      return FcResultMatch;
    }
  } else if (strcmp(object, FC_FULLNAME) == 0) {
    if (n >= 0 && n < p->nfull) {
      *s = (FcChar8 *)p->full[n];
      return FcResultMatch;
    }
  }
  return FcResultNoMatch;
}

FcResult FcPatternGetInteger(const FcPattern *p, const char *object, int n, int *i) {
  if (!p || !object || n != 0) return FcResultNoMatch;
  if (strcmp(object, FC_INDEX) == 0) {
    *i = p->index;
    return FcResultMatch;
  }
  if (!p->has_metrics) return FcResultNoMatch;
  if (strcmp(object, FC_WEIGHT) == 0) {
    *i = p->weight;
    return FcResultMatch;
  }
  if (strcmp(object, FC_WIDTH) == 0) {
    *i = p->width;
    return FcResultMatch;
  }
  if (strcmp(object, FC_SLANT) == 0) {
    *i = p->slant;
    return FcResultMatch;
  }
  return FcResultNoMatch;
}

/* ---- FT_New_Face interpose -------------------------------------------------- */
/* FreeType's FT_New_Face opens a path via stdio; under WASM the font isn't local
 * until kpse fetches it. Wrap it: kpse-fetch a bare basename (→ CDN by extension),
 * then open the local copy. Declared with void* to avoid pulling FreeType headers
 * into this C unit; the ABI matches FT_New_Face(FT_Library, const char*, FT_Long, FT_Face*). */
extern int __real_FT_New_Face(void *library, const char *pathname, long face_index, void *aface);

static int font_format_of(const char *name) {
  const char *dot = strrchr(name, '.');
  if (dot) {
    if (strcasecmp(dot, ".otf") == 0) return KPSE_OPENTYPE_FORMAT;
    if (strcasecmp(dot, ".ttf") == 0 || strcasecmp(dot, ".ttc") == 0) return KPSE_TRUETYPE_FORMAT;
    if (strcasecmp(dot, ".pfb") == 0 || strcasecmp(dot, ".pfa") == 0) return KPSE_TYPE1_FORMAT;
  }
  return KPSE_TRUETYPE_FORMAT;
}

int __wrap_FT_New_Face(void *library, const char *pathname, long face_index, void *aface) {
  if (pathname && strchr(pathname, '/') == NULL) {
    char *local = kpse_find_file(pathname, font_format_of(pathname), 1);
    if (local) {
      int err = __real_FT_New_Face(library, local, face_index, aface);
      free(local);
      return err;
    }
  }
  return __real_FT_New_Face(library, pathname, face_index, aface);
}
