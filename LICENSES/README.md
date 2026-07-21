# Included license texts

These files preserve notices for third-party code and data distributed by WasmTex.
They do not change the license of any component.

| File | Applies to |
| --- | --- |
| `Apache-2.0.txt` | PDF.js and other Apache-2.0 components when distributed. |
| `BibTeX.txt` | BibTeX 0.99d and the separately identified WasmTex/Web2C port. |
| `Emscripten-3.1.46.txt` | Emscripten-generated runtime code and Emscripten notices. |
| `FreeType.txt` | FreeType's alternative FreeType License text. The XeTeX release selects GPL-2.0-only instead because Xpdf fixes that combined unit at GPLv2. |
| `GPL-2.0.txt` | GPL-2.0 and GPL-2.0-or-later engine components. |
| `GPL-3.0.txt` | GPL version 3 text, copied byte-for-byte from the pinned Xpdf 4.04 `COPYING3`. |
| `Graphite2.txt` | Graphite2's LGPL/MPL/GPL licensing notice. |
| `HarfBuzz.txt` | HarfBuzz's Old MIT notice. |
| `ICU-68.2.txt` | ICU 68.2 code, data, and bundled third-party notices. |
| `LGPL-2.0.txt` | LGPL-2.0 components such as zziplib when that option is used. |
| `LGPL-2.1.txt` | LGPL-2.1 and LGPL-2.1-or-later components such as kpathsea. |
| `libpng.txt` | The bundled/ported libpng implementation. |
| `LLVM-exception.txt` | The LLVM exception used with Apache-2.0 for libc++, libc++abi, and compiler-rt. |
| `Lua-5.3.txt` | Lua 5.3.6 embedded in LuaHBTeX. |
| `LuaHBTeX-embedded.txt` | Index of retained notices for LuaHBTeX's embedded libraries. |
| LPPL 1.3c | LaTeX formats and packages that identify LPPL 1.3c as their license. Use the exact package notice; authoritative text: <https://www.latex-project.org/lppl/lppl-1-3c/>. |
| `MakeIndex.txt` | The makeindex source and WasmTex WebAssembly port. |
| `Monaco-Editor.txt` | Monaco Editor when bundled by the demo application. |
| `musl.txt` | musl libc linked from the Emscripten sysroot; the complete component notice is also in corresponding source. |
| `pdf-lib.txt` | pdf-lib when the optional peer is bundled. |
| `SyncTeX.txt` | The reference SyncTeX algorithms ported to TypeScript. |
| `TECkit.txt` | TECkit's CPL/LGPL licensing notice. |
| `XeTeX.txt` | XeTeX changes and additions. |
| `Xpdf-4.04-GPL-2.0.txt` | GPL version 2 text copied byte-for-byte from the pinned Xpdf 4.04 `COPYING`. |
| `Xpdf-4.04-README.txt` | Xpdf 4.04 README and its GPL v2-or-v3 licensing notice, normalized from ISO-8859-1 to UTF-8. |
| `zlib.txt` | The bundled/ported zlib implementation. |
| `zziplib.txt` | zziplib's LGPL/MPL licensing notice. |

TeX Live packages, fonts, Lua files, generated formats, and some libraries embedded
in engine builds have additional component-specific terms. See
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) and
[`docs/licensing.md`](../docs/licensing.md); an engine or mirror release must also
ship the notices from its exact corresponding source archive.

There is deliberately no `pplib` license file here. The copies inspected in the
pinned TeX Live source and public upstream repository do not provide a standalone
license grant that WasmTex can reproduce. This remains relevant to legacy
LuaHBTeX and XeTeX artifacts, which must not be released. New builds use WTPDF/Xpdf
and reject `pplib` at the source, link-map, and release-byte gates. See
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md#legacy-pplib-licensing-evidence).
