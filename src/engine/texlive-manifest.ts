/**
 * TeX Live file manifest for warmup preloading.
 *
 * Derived from network trace of a first compilation with the default
 * article.cls + amsmath/amssymb/amsthm document. Excludes pdftex.map
 * which is already preloaded separately by the engine.
 *
 * kpathsea format numbers:
 *   3  = tfm (TeX Font Metrics)
 *   7  = bst (BibTeX style)
 *   26 = tex (TeX input: .sty, .cls, .def, .clo, .fd)
 *   32 = type1 (PostScript Type 1 fonts: .pfb)
 *   33 = vf (Virtual Fonts)
 *   44 = enc (Encoding files)
 */
import type { TexliveFileEntry } from '../types'

/** Files that return 200 from the CDN and are needed for first compilation. */
export const PRELOAD_FILES: TexliveFileEntry[] = [
  // --- TeX input files (format 26): .sty, .cls, .def, .clo, .fd ---
  { format: 26, filename: 'amsbsy.sty' },
  { format: 26, filename: 'amsfonts.sty' },
  { format: 26, filename: 'amsgen.sty' },
  { format: 26, filename: 'amsmath.sty' },
  { format: 26, filename: 'amsopn.sty' },
  { format: 26, filename: 'amssymb.sty' },
  { format: 26, filename: 'amstext.sty' },
  { format: 26, filename: 'amsthm.sty' },
  { format: 26, filename: 'article.cls' },
  { format: 26, filename: 'l3backend-pdftex.def' },
  { format: 26, filename: 'size10.clo' },
  { format: 26, filename: 'umsa.fd' },
  { format: 26, filename: 'umsb.fd' },

  // --- TFM files (format 3) ---
  { format: 3, filename: 'cmbx10' },
  { format: 3, filename: 'cmbx12' },
  { format: 3, filename: 'cmbx5' },
  { format: 3, filename: 'cmbx6' },
  { format: 3, filename: 'cmbx7' },
  { format: 3, filename: 'cmbx8' },
  { format: 3, filename: 'cmex10' },
  { format: 3, filename: 'cmex7' },
  { format: 3, filename: 'cmex8' },
  { format: 3, filename: 'cmmi12' },
  { format: 3, filename: 'cmmi6' },
  { format: 3, filename: 'cmmi8' },
  { format: 3, filename: 'cmr12' },
  { format: 3, filename: 'cmr17' },
  { format: 3, filename: 'cmr6' },
  { format: 3, filename: 'cmr8' },
  { format: 3, filename: 'cmsy10' },
  { format: 3, filename: 'cmsy6' },
  { format: 3, filename: 'cmsy8' },
  { format: 3, filename: 'cmti10' },
  { format: 3, filename: 'msam10' },
  { format: 3, filename: 'msam5' },
  { format: 3, filename: 'msam7' },
  { format: 3, filename: 'msbm10' },
  { format: 3, filename: 'msbm5' },
  { format: 3, filename: 'msbm7' },
  { format: 3, filename: 'tcrm1000' },

  // --- Type 1 fonts (format 32): .pfb ---
  { format: 32, filename: 'cmbx10.pfb' },
  { format: 32, filename: 'cmbx12.pfb' },
  { format: 32, filename: 'cmbx8.pfb' },
  { format: 32, filename: 'cmex10.pfb' },
  { format: 32, filename: 'cmmi10.pfb' },
  { format: 32, filename: 'cmmi5.pfb' },
  { format: 32, filename: 'cmmi6.pfb' },
  { format: 32, filename: 'cmmi7.pfb' },
  { format: 32, filename: 'cmmi8.pfb' },
  { format: 32, filename: 'cmr10.pfb' },
  { format: 32, filename: 'cmr12.pfb' },
  { format: 32, filename: 'cmr17.pfb' },
  { format: 32, filename: 'cmr5.pfb' },
  { format: 32, filename: 'cmr6.pfb' },
  { format: 32, filename: 'cmr7.pfb' },
  { format: 32, filename: 'cmr8.pfb' },
  { format: 32, filename: 'cmsy10.pfb' },
  { format: 32, filename: 'cmsy6.pfb' },
  { format: 32, filename: 'cmsy7.pfb' },
  { format: 32, filename: 'cmsy8.pfb' },
  { format: 32, filename: 'cmti10.pfb' },
  { format: 32, filename: 'msbm10.pfb' },
  { format: 32, filename: 'sfrm1000.pfb' },

  // --- Encoding files (format 44) ---
  { format: 44, filename: 'cm-super-ts1.enc' },
]

/**
 * Files that return 403/404 from the CDN. Pre-populating these in the
 * worker's 404 cache avoids wasted sync XHR round-trips (~75ms each).
 *
 * Note: The bloom filter (bloom-filter.bin) also prevents XHR for files
 * not on the CDN, but KNOWN_404S is still useful for the warmup() path
 * which runs before the bloom filter is loaded into the worker.
 *
 * Verified against actual Playwright console output (90 total XHR:
 * 64 Downloaded + 26 Failed).
 *
 * - 23 .vf (virtual font) lookups: pdfTeX checks for VF files when
 *   shipping out characters. Includes fonts from the .fmt and from
 *   TFM downloads. None of the CM/AMS fonts have VF files on the CDN.
 * - 3 project aux files: main.aux/toc/bbl don't exist on first compile.
 */
export const KNOWN_404S: TexliveFileEntry[] = [
  // --- Virtual font lookups (format 33) ---
  // pdfTeX checks for .vf when outputting glyphs. The lookup name
  // includes the .vf extension (e.g. "cmr17.vf"). CloudFront returns
  // 403 (not 404) so the worker's extension-retry logic is never
  // reached — the cache key must match the full name with extension.
  { format: 33, filename: 'cmbx8.vf' },
  { format: 33, filename: 'cmbx10.vf' },
  { format: 33, filename: 'cmbx12.vf' },
  { format: 33, filename: 'cmex10.vf' },
  { format: 33, filename: 'cmmi5.vf' },
  { format: 33, filename: 'cmmi6.vf' },
  { format: 33, filename: 'cmmi7.vf' },
  { format: 33, filename: 'cmmi8.vf' },
  { format: 33, filename: 'cmmi10.vf' },
  { format: 33, filename: 'cmr5.vf' },
  { format: 33, filename: 'cmr6.vf' },
  { format: 33, filename: 'cmr7.vf' },
  { format: 33, filename: 'cmr8.vf' },
  { format: 33, filename: 'cmr10.vf' },
  { format: 33, filename: 'cmr12.vf' },
  { format: 33, filename: 'cmr17.vf' },
  { format: 33, filename: 'cmsy6.vf' },
  { format: 33, filename: 'cmsy7.vf' },
  { format: 33, filename: 'cmsy8.vf' },
  { format: 33, filename: 'cmsy10.vf' },
  { format: 33, filename: 'cmti10.vf' },
  { format: 33, filename: 'msbm10.vf' },
  { format: 33, filename: 'tcrm1000.vf' },

  // --- Project aux files (not on CDN, 403 on first compile) ---
  { format: 26, filename: 'main.aux' },
  { format: 26, filename: 'main.toc' },
  { format: 26, filename: 'main.bbl' },
]
