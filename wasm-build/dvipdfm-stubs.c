/* =============================================================================
 * dvipdfm-stubs.c — libpaper + getpass stubs for the WASM dvipdfmx build  [#52]
 * =============================================================================
 *
 * texlive's dvipdfmx links libpaper (paper-size database) and uses getpass()
 * (interactive encryption-password prompt). Neither exists under WASM. We provide
 * a minimal libpaper: the real page size comes from the XDV, so dvipdfmx only needs
 * a small built-in table for its default/named-paper lookups. (A previous dpx
 * tree dropped libpaper entirely.)
 *
 * IMPORTANT — match libpaper's REAL signatures (paper.h), which dvipdfmx.c relies on:
 *   paperinit()/paperdone()    -> int                    (NOT void!)
 *   paperinfo(spec)            -> const struct paper *   (NULL if unknown)
 *   papername(pi)/paperpswidth(pi)/paperpsheight(pi) take a const struct paper *
 *   systempapername()/defaultpapername() -> const char *
 *   paperfirst()/papernext(pi)           -> const struct paper *
 * Getting a RETURN TYPE wrong matters under WASM: the caller's declared signature
 * (from paper.h) must match the linked definition's, or the indirect/strict call
 * traps with `RuntimeError: unreachable` (signature_mismatch). paperinit() returning
 * `void` instead of `int` made main()'s very first paper call crash — surfacing as a
 * silent hang because runEngine() only catches ExitStatus. Getting an ARG/return-value
 * wrong (e.g. paperinfo() returning NULL) also sends select_paper() down the "WxH"
 * parse / ERROR path. Keep every signature byte-identical to paper.h.
 * ========================================================================== */
#include <stdlib.h>
#include <strings.h>

struct paper {
  const char *name;
  double pswidth, psheight; /* PostScript points */
};

/* A small built-in table; the actual page geometry comes from the XDV. */
static const struct paper papers[] = {
    {"letter", 612.0, 792.0},      {"a4", 595.276, 841.890},
    {"legal", 612.0, 1008.0},      {"a3", 841.890, 1190.551},
    {"a5", 419.528, 595.276},      {"b5", 498.898, 708.661},
    {"executive", 522.0, 756.0},   {"ledger", 1224.0, 792.0},
    {"tabloid", 792.0, 1224.0},    {NULL, 0.0, 0.0},
};

int paperinit(void) { return 0; }
int paperdone(void) { return 0; }

const char *systempapername(void) { return "letter"; }
const char *defaultpapername(void) { return "letter"; }

const struct paper *paperinfo(const char *paperspec) {
  if (paperspec)
    for (const struct paper *p = papers; p->name; p++)
      if (strcasecmp(p->name, paperspec) == 0) return p;
  return NULL;
}

const char *papername(const struct paper *p) { return p ? p->name : NULL; }
double paperpswidth(const struct paper *p) { return p ? p->pswidth : 612.0; }
double paperpsheight(const struct paper *p) { return p ? p->psheight : 792.0; }

const struct paper *paperfirst(void) { return &papers[0]; }
const struct paper *papernext(const struct paper *p) {
  if (!p || !p->name) return NULL;
  ++p;
  return p->name ? p : NULL;
}

/* No terminal in WASM; the -S encryption-password path is never exercised. */
char *getpass(const char *prompt) {
  (void)prompt;
  return NULL;
}
