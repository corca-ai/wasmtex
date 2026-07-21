# Third-Party Notices

The MIT license in [`LICENSE`](LICENSE) applies to original WasmTex code and
documentation unless a file says otherwise. It does not relicense third-party code,
generated engine artifacts, TeX Live files, fonts, or data. Those materials remain
under their respective licenses.

This notice records the components known to be used by the current source tree. A
binary or CDN distributor must also retain every notice from the exact source and
data files included in that release.

## SyncTeX parser

`src/synctex/synctex-parser.ts` ports algorithms from the TeX Live reference
`synctex_parser.c` by Jérôme Laurens.

- Copyright: 2008-2017 Jérôme Laurens
- License: MIT-like permission notice with a non-endorsement clause
- Notice: [`LICENSES/SyncTeX.txt`](LICENSES/SyncTeX.txt)
- Upstream: <https://github.com/TeX-Live/texlive-source/tree/trunk/texk/web2c/synctexdir>

## TeX Live engine artifacts

The engine build is pinned to TeX Live source commit
`143f1723353b20202645f241db429b080a8adcdf`. The generated JavaScript, WebAssembly,
worker, and format files under `public/wasmtex/<year>/` and `wasm-build/dist*/` are
not covered solely by the WasmTex MIT license.

| Artifact family | Principal upstream terms |
| --- | --- |
| pdfTeX | GPL-2.0-or-later, together with Web2C, kpathsea, SyncTeX, xpdf, libpng, zlib, and other notices from the corresponding source. |
| BibTeX | Web2C/BibTeX source terms and LGPL-2.1-or-later kpathsea; consult the corresponding source files. |
| BibTeX8 | GPL-2.0-or-later source in `texk/bibtex-x`, plus kpathsea and linked-library terms. |
| makeindex | The MakeIndex Distribution Notice, plus LGPL-2.1-or-later kpathsea and linked-library terms. The WebAssembly port is a modified version for purposes of that notice. |
| XeTeX | The permissive XeTeX notice, plus Xpdf 4.04 under GPL v2 and/or GPL v3, the MIT WTPDF adapter, kpathsea, FreeType, ICU, HarfBuzz, Graphite2, TECkit, libpng, zlib, and other linked-library terms. This is a GPL/mixed-license binary, not an MIT-only artifact. |
| dvipdfmx | GPL-2.0-or-later terms, plus kpathsea, FreeType, libpng, zlib, and other linked-library terms. |
| LuaHBTeX | GPL-2.0-or-later engine terms, plus Xpdf 4.04 under GPL v2 and/or GPL v3, the MIT WTPDF adapter and SHA-2 helper, kpathsea, Lua, HarfBuzz, Graphite2, zziplib, libpng, zlib, and other notices from the corresponding source. |

Relevant license texts included here are:

- [`LICENSES/GPL-2.0.txt`](LICENSES/GPL-2.0.txt)
- [`LICENSES/GPL-3.0.txt`](LICENSES/GPL-3.0.txt)
- [`LICENSES/LGPL-2.1.txt`](LICENSES/LGPL-2.1.txt)
- [`LICENSES/MakeIndex.txt`](LICENSES/MakeIndex.txt)
- [`LICENSES/XeTeX.txt`](LICENSES/XeTeX.txt)
- [`LICENSES/SyncTeX.txt`](LICENSES/SyncTeX.txt)
- [`LICENSES/Xpdf-4.04-README.txt`](LICENSES/Xpdf-4.04-README.txt)

Corresponding source means the pinned TeX Live source plus the WasmTex glue, patches,
build scripts, Dockerfiles, and any other material needed to rebuild the distributed
object code. The build inputs are described in `wasm-build/` and
`wasm-build/texlive-source.ref`. A distributor must make a complete source bundle
available with each binary release; an upstream link alone is not a substitute for
that bundle.

### Legacy pplib licensing evidence

Legacy LuaHBTeX and XeTeX artifacts included `pplib`. The pinned TeX Live copy and
the public pplib repository do not contain a standalone license grant that is
sufficient for WasmTex to record exact redistribution terms. Inclusion in TeX Live
is useful context, but it is not a replacement for a license notice from the
copyright holder.

Do not publish any legacy `pplib`-linked browser artifact as a cleared release.
Such an artifact would require one of the following:

- an explicit upstream license or written redistribution grant covering pplib;
- a licensed replacement for pplib; or
- a build and link audit proving that the distributed artifact no longer contains it.

This is a documentation/evidence blocker; it is not a claim that upstream lacks a
valid private or historical grant.

The current WTPDF/Xpdf XeTeX and LuaHBTeX candidates no longer contain this
dependency. Their build evidence is recorded in
[`docs/license-evidence/xetex-wtpdf-23f2ce1.md`](docs/license-evidence/xetex-wtpdf-23f2ce1.md)
and
[`docs/license-evidence/luahbtex-wtpdf-666663b.md`](docs/license-evidence/luahbtex-wtpdf-666663b.md).
Those results remove the `pplib` evidence blocker for new builds only; the remaining
corresponding-source, notices, relink, security, and compatibility gates still
apply.

## Emscripten and ports

Engine artifacts are generated with Emscripten 3.1.46. Emscripten is distributed
under the MIT and University of Illinois/NCSA licenses and incorporates separately
licensed runtime code. See [`LICENSES/Emscripten-3.1.46.txt`](LICENSES/Emscripten-3.1.46.txt).

Emscripten ports retain their upstream licenses. In particular, current builds use
ports including FreeType, ICU, libpng, and zlib. FreeType is dual-licensed under the
FreeType License or GPLv2; the FreeType License text is retained in
[`LICENSES/FreeType.txt`](LICENSES/FreeType.txt).

Notices for libraries linked by one or more current engines are also retained in:

- [`LICENSES/HarfBuzz.txt`](LICENSES/HarfBuzz.txt)
- [`LICENSES/Graphite2.txt`](LICENSES/Graphite2.txt)
- [`LICENSES/TECkit.txt`](LICENSES/TECkit.txt)
- [`LICENSES/libpng.txt`](LICENSES/libpng.txt)
- [`LICENSES/zlib.txt`](LICENSES/zlib.txt)
- [`LICENSES/zziplib.txt`](LICENSES/zziplib.txt)
- [`LICENSES/LGPL-2.0.txt`](LICENSES/LGPL-2.0.txt)

## ICU data

`icudt68l.dat` is built from ICU 68.2 source and data. It is governed by the ICU
license and the third-party notices contained in the exact ICU 68.2 release. See
[`LICENSES/ICU-68.2.txt`](LICENSES/ICU-68.2.txt).

## TeX Live packages, fonts, Lua files, and formats

The separately operated versioned CDN mirrors the full official TeX Live 2025
distribution. TeX Live is an aggregation: individual packages and fonts can use
LPPL, SIL OFL, GPL, permissive, public-domain, or other terms. Generated `.fmt` files
are compiled works whose source inputs retain their own terms. None of these files is
licensed by WasmTex under MIT.

The LaTeX kernel and many base packages use LPPL 1.3c. The authoritative license
text is available from the LaTeX Project at
<https://www.latex-project.org/lppl/lppl-1-3c/>. A release must retain the exact
license and source material belonging to each mirrored package rather than assuming
that every TeX Live file uses LPPL.

The full mirror must preserve the official distribution's copying information and
the license/source materials shipped for its packages. A package-by-package manual
override database is not a WasmTex engine-release gate. The exact inputs and creation
procedure for `.fmt` files distributed with an engine release remain part of that
release's evidence. See <https://tug.org/texlive/copying.html> and the scope in
[`docs/licensing.md`](docs/licensing.md).

## Host-provided and optional peers

The library build treats these packages as peer dependencies and does not copy them
into `lib/`. The standalone demo build may bundle them, in which case their notices
must accompany that build.

| Component | Version range | License | Included notice |
| --- | --- | --- | --- |
| Monaco Editor | `^0.55.1` | MIT | [`LICENSES/Monaco-Editor.txt`](LICENSES/Monaco-Editor.txt) |
| PDF.js (`pdfjs-dist`) | `^5.4.624` | Apache-2.0 | [`LICENSES/Apache-2.0.txt`](LICENSES/Apache-2.0.txt) |
| pdf-lib | `^1.17.1` | MIT | [`LICENSES/pdf-lib.txt`](LICENSES/pdf-lib.txt) |

Development-only dependencies are not listed here unless they are copied into a
distributed artifact. Their own package notices continue to apply.
