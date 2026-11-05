/* =============================================================================
 * kpse-hook.c — Wraps kpse_find_file to add JS network fallback for WASM
 * =============================================================================
 *
 * Used with linker flag: -Wl,--wrap=kpse_find_file
 *
 * When pdfTeX can't find a file locally (MEMFS), this wrapper calls out to
 * JavaScript (kpse_find_file_js) which fetches the file from the TexLive
 * server via synchronous XHR.
 *
 * The --wrap mechanism works by:
 *   - Renaming all references to kpse_find_file → __wrap_kpse_find_file
 *   - Renaming the original definition → __real_kpse_find_file
 *   - Our __wrap version calls __real first, then falls back to JS
 * ========================================================================== */

/* The original kpse_find_file from libkpathsea.a (renamed by --wrap) */
extern char *__real_kpse_find_file(const char *name, int format,
                                   int must_exist);

/* JS function provided via --js-library library.js */
extern char *kpse_find_file_js(const char *name, int format, int must_exist);

char *__wrap_kpse_find_file(const char *name, int format, int must_exist)
{
    /* Try kpathsea's normal search first (checks MEMFS paths).
     *
     * We force must_exist=0 for this local search. kpathsea only invokes its
     * on-the-fly generators (mktextfm/mktexpk/mktexmf) when a file is missing
     * AND must_exist is true; those generators fork()/exec a shell, which is
     * unimplemented in the WASM sandbox. The spawn always fails with
     *   kpathsea: Running mktextfm <font>
     *   fork(): Function not implemented
     * — benign noise (the JS/CDN fallback below supplies the file anyway), but
     * it misleads diagnosis: the dead spawn gets read as the root cause of
     * unrelated downstream errors (see #167, #165). Suppressing the doomed make
     * attempt is pure win — it never succeeds here — and a genuinely unavailable
     * file is still surfaced cleanly by the engine (e.g. "font not found") once
     * the fallback misses. */
    char *result = __real_kpse_find_file(name, format, 0);
    if (result)
        return result;

    /* Fall back to JS network fetch from TexLive server. Forward the caller's
     * original must_exist (the JS impl ignores it today, but keep intent). */
    return kpse_find_file_js(name, format, must_exist);
}

#ifdef WASMTEX_GLYPH_HOOK
/* kpathsea would run mktexpk here, which forks. The controller makes the bitmap with
 * WebAssembly Metafont instead, so a font without an outline loads as it does under
 * TeX Live. Linked with -Wl,--wrap=kpse_find_glyph by the engines that embed PK. */
typedef struct {
    const char *name;
    unsigned dpi;
    int format;
    int source;
} kpse_glyph_file;

enum { KPSE_PK_FORMAT = 1, KPSE_SOURCE_MAKETEX = 2, KPSE_SRC_COMPILE = 1 };

extern char *__real_kpse_find_glyph(const char *name, unsigned dpi, int format,
                                    kpse_glyph_file *glyph);
extern void kpse_set_program_enabled(int format, int value, int level);
extern char *kpse_find_pk_js(const char *name, unsigned dpi);

char *__wrap_kpse_find_glyph(const char *name, unsigned dpi, int format, kpse_glyph_file *glyph)
{
    kpse_set_program_enabled(KPSE_PK_FORMAT, 0, KPSE_SRC_COMPILE);
    char *result = __real_kpse_find_glyph(name, dpi, format, glyph);
    if (result)
        return result;

    result = kpse_find_pk_js(name, dpi);
    if (result && glyph) {
        glyph->name = name;
        glyph->dpi = dpi;
        glyph->format = KPSE_PK_FORMAT;
        glyph->source = KPSE_SOURCE_MAKETEX;
    }
    return result;
}
#endif

#ifdef WASMTEX_INSTANCE_HOOK
/* kpse.new() searches through its own instance and never reaches kpse_find_file, so
 * luamplib could not load plain.mp. Only those instances take the JS fallback here;
 * kpse_def keeps the route above. Linked with -Wl,--wrap=kpathsea_find_file. */
extern void *kpse_def;
extern char *__real_kpathsea_find_file(void *kpse, const char *name, int format, int must_exist);

char *__wrap_kpathsea_find_file(void *kpse, const char *name, int format, int must_exist)
{
    if (kpse == kpse_def)
        return __real_kpathsea_find_file(kpse, name, format, must_exist);
    char *result = __real_kpathsea_find_file(kpse, name, format, 0);
    if (result)
        return result;
    return kpse_find_file_js(name, format, must_exist);
}
#endif
