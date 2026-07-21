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
