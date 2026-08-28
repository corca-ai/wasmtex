# =============================================================================
# Makefile: pdfTeX WASM with SyncTeX — Two-Phase Build
# =============================================================================
#
# Building pdfTeX for WebAssembly requires a two-phase approach, derived from
# the BusyTeX project's methodology:
#
#   Phase 1 — Native Build
#   -----------------------
#   TeX Live's web2c subsystem converts Pascal-like WEB sources into C code
#   using the "tangle" and "otangle" tools. These tools are themselves built
#   from the TeX Live source tree. Under Emscripten, the code-generation
#   binaries produce incorrect output (wrong endianness, broken I/O), so we
#   MUST build them natively first.
#
#   The native build runs the full TeX Live configure + make in texk/web2c/,
#   which produces the generated C files:
#     - pdftex0.c        (main pdfTeX engine logic, from pdftex.web)
#     - pdftexini.c      (initialization code)
#     - pdftex-pool.c    (string pool)
#     - pdftexd.h        (generated header)
#     - pdftexcoerce.h   (coercion macros)
#
#   Phase 2 — WASM Build
#   ---------------------
#   We run TeX Live's configure again, this time through emconfigure/emmake,
#   to set up the Emscripten build environment and generate proper config
#   headers (c-auto.h, cpascal.h, etc.). Then we copy over the natively-
#   generated C files from Phase 1 (replacing the ones Emscripten would
#   produce incorrectly), and compile everything with emcc.
#
#   The WASM build includes SyncTeX sources and the synctex symbol renames
#   to avoid conflicts with the pdfTeX namespace.
#
# =============================================================================

# --- Directories -------------------------------------------------------------

TEXLIVE_SRC  = /src/texlive-source
BUILD_NATIVE = /build/native
BUILD_WASM   = /build/wasm
DIST         = /dist
PDFTEX_WORKER = /src/pdftex-worker.js
KPSE_RESOLVE = /src/kpse-resolve.cjs
WASM_ENTRY   = /src/wasm-entry.c
KPSE_HOOK    = /src/kpse-hook.c
TRACE_HOOK   = /src/trace-hook.c
JSLIB        = /src/library.js

# --- Source directories (shortcuts) ------------------------------------------

WEB2C_SRC    = $(TEXLIVE_SRC)/texk/web2c
WEB2C_BUILD  = $(BUILD_WASM)/texk/web2c

# --- web2c lib sources (explicitly listed to exclude texmfmp.c) ---------------
# texmfmp.c is #include'd by pdftexdir/pdftexextra.c and must NOT be compiled
# standalone, to avoid duplicate symbols. Likewise, lib/main.c defines main(),
# argc, argv — but pdftexextra.c (via texmfmp.c) also defines these, so we
# exclude main.c to prevent duplicate symbol errors at link time.

WEB2C_LIB_SOURCES = \
	$(WEB2C_SRC)/lib/basechsuffix.c \
	$(WEB2C_SRC)/lib/chartostring.c \
	$(WEB2C_SRC)/lib/coredump.c \
	$(WEB2C_SRC)/lib/eofeoln.c \
	$(WEB2C_SRC)/lib/fprintreal.c \
	$(WEB2C_SRC)/lib/input2int.c \
	$(WEB2C_SRC)/lib/inputint.c \
	$(WEB2C_SRC)/lib/openclose.c \
	$(WEB2C_SRC)/lib/printversion.c \
	$(WEB2C_SRC)/lib/setupvar.c \
	$(WEB2C_SRC)/lib/uexit.c \
	$(WEB2C_SRC)/lib/usage.c \
	$(WEB2C_SRC)/lib/version.c \
	$(WEB2C_SRC)/lib/zround.c

# --- pdftexdir sources (the PDF generation engine) ----------------------------
# These are CRITICAL — without them there's no PDF output, no font embedding,
# no image support.

PDFTEX_C_SOURCES = \
	$(WEB2C_SRC)/pdftexdir/avl.c \
	$(WEB2C_SRC)/pdftexdir/avlstuff.c \
	$(WEB2C_SRC)/pdftexdir/epdf.c \
	$(WEB2C_SRC)/pdftexdir/mapfile.c \
	$(WEB2C_SRC)/pdftexdir/pkin.c \
	$(WEB2C_SRC)/pdftexdir/subfont.c \
	$(WEB2C_SRC)/pdftexdir/tounicode.c \
	$(WEB2C_SRC)/pdftexdir/utils.c \
	$(WEB2C_SRC)/pdftexdir/vfpacket.c \
	$(WEB2C_SRC)/pdftexdir/writeenc.c \
	$(WEB2C_SRC)/pdftexdir/writefont.c \
	$(WEB2C_SRC)/pdftexdir/writeimg.c \
	$(WEB2C_SRC)/pdftexdir/writejbig2.c \
	$(WEB2C_SRC)/pdftexdir/writejpg.c \
	$(WEB2C_SRC)/pdftexdir/writepng.c \
	$(WEB2C_SRC)/pdftexdir/writet1.c \
	$(WEB2C_SRC)/pdftexdir/writet3.c \
	$(WEB2C_SRC)/pdftexdir/writettf.c \
	$(WEB2C_SRC)/pdftexdir/writezip.c \
	$(WEB2C_SRC)/pdftexdir/pdftexextra.c

# C++ source (requires em++ mode — emcc handles .cc extension automatically)
PDFTEX_CXX_SOURCES = \
	$(WEB2C_SRC)/pdftexdir/pdftoepdf.cc

# --- TeX Live configure flags common to both phases --------------------------
#
# We disable everything except pdfTeX + kpathsea. The --disable-all-pkgs flag
# turns off all TeX programs; we selectively re-enable pdfTeX.
# --enable-synctex is the key flag for SyncTeX support.

COMMON_CONFIGURE_FLAGS = \
	--disable-all-pkgs \
	--enable-pdftex \
	--enable-bibtex \
	--enable-synctex \
	--enable-web2c \
	--without-x \
	--disable-shared \
	--disable-multiplatform \
	--disable-native-texlive-build \
	--disable-xetex \
	--disable-luatex \
	--disable-luajittex \
	--disable-luahbtex \
	--disable-mf \
	--disable-mp \
	--disable-ptex \
	--disable-eptex \
	--disable-uptex \
	--disable-euptex \
	--without-mf-x-toolkit

# --- SyncTeX symbol renames --------------------------------------------------
#
# pdfTeX and SyncTeX both define some symbols that collide. The BusyTeX
# project solved this by renaming all public synctex_* symbols to have a
# pdftex_ prefix via -D defines. This avoids linker errors when synctex.o
# and pdftex.o are linked together.

SYNCTEX_REDEFINE = \
	-D__SyncTeX__ \
	-Dsynctexabort=pdftex_synctexabort \
	-Dsynctexinitcommand=pdftex_synctexinitcommand \
	-Dsynctexstartinput=pdftex_synctexstartinput \
	-Dsynctexsheet=pdftex_synctexsheet \
	-Dsynctexteehs=pdftex_synctexteehs \
	-Dsynctexhlist=pdftex_synctexhlist \
	-Dsynctexvlist=pdftex_synctexvlist \
	-Dsynctextsilh=pdftex_synctextsilh \
	-Dsynctextsilv=pdftex_synctextsilv \
	-Dsynctexvoidhlist=pdftex_synctexvoidhlist \
	-Dsynctexvoidvlist=pdftex_synctexvoidvlist \
	-Dsynctexchar=pdftex_synctexchar \
	-Dsynctexkern=pdftex_synctexkern \
	-Dsynctexmath=pdftex_synctexmath \
	-Dsynctexhorizontalruleorglue=pdftex_synctexhorizontalruleorglue \
	-Dsynctexterminate=pdftex_synctexterminate \
	-Dsynctexcurrent=pdftex_synctexcurrent \
	-Dsynctexnode=pdftex_synctexnode \
	-Dsynctexpdfxform=pdftex_synctexpdfxform \
	-Dsynctexmrofxfdp=pdftex_synctexmrofxfdp \
	-Dsynctexpdfrefxform=pdftex_synctexpdfrefxform \
	-Dsynctexoption=pdftex_synctexoption \
	-Dsynctex_ctxt=pdftex_synctex_ctxt \
	-Dsynctex_dot_open=pdftex_synctex_dot_open \
	-Dsynctex_record_node_char=pdftex_synctex_record_node_char \
	-Dsynctex_record_node_kern=pdftex_synctex_record_node_kern \
	-Dsynctex_record_node_math=pdftex_synctex_record_node_math \
	-Dsynctex_record_node_unknown=pdftex_synctex_record_node_unknown \
	-Dsynctextagfield=pdftex_synctextagfield

# --- Emscripten flags --------------------------------------------------------
#
# ALLOW_MEMORY_GROWTH: pdfTeX can need variable amounts of memory depending
#   on the document being compiled.
# FORCE_FILESYSTEM:    we need Emscripten's virtual filesystem (MEMFS) for
#   reading/writing .tex, .pdf, .synctex, .fmt, and cached texlive files.
# EXIT_RUNTIME=0:      keep the runtime alive after main() returns so we
#   can call compileLaTeX/compileBibtex/compileFormat repeatedly.
# INVOKE_RUN=0:        do not auto-run main() on module load; the worker
#   calls the exported functions explicitly.
# MODULARIZE=0:        we do NOT want a factory function — the worker script
#   sets up Module directly.
# EXPORTED_FUNCTIONS:  the C entry points our worker calls.
# EXTRA_EXPORTED_RUNTIME_METHODS: cwrap for calling C functions, FS for
#   virtual filesystem access.

# The worker keeps an initialization snapshot and copies it before every run, so
# an oversized initial heap is multiplied in browser memory. pdfTeX grows on
# demand; 64 MiB covers the golden corpus and large-document smoke test while
# keeping the snapshot bounded. Override this for build experiments/corpus bisects.
PDFTEX_INITIAL_MEMORY ?= 67108864

EMCC_FLAGS = \
	-O2 \
	-sEMIT_EMSCRIPTEN_LICENSE=1 \
	-Wno-implicit-function-declaration \
	-sALLOW_MEMORY_GROWTH=1 \
	-sFORCE_FILESYSTEM=1 \
	-sEXIT_RUNTIME=0 \
	-sINVOKE_RUN=0 \
	-sMODULARIZE=0 \
	-sEXPORTED_FUNCTIONS='["_compileLaTeX","_compileBibtex","_compileFormat","_main","_setMainEntry","_malloc","_free","_scanHashTable"]' \
	-sEXPORTED_RUNTIME_METHODS='["cwrap","FS","UTF8ToString","stringToUTF8","lengthBytesUTF8","HEAPU8"]' \
	-sINITIAL_MEMORY=$(PDFTEX_INITIAL_MEMORY) \
	-sWASM=1 \
	--js-library $(JSLIB) \
	-Wl,--wrap=kpse_find_file \
	-Wl,-Map=$(DIST)/wasmtex-pdftex.map

# =============================================================================
# Phase 1: Native Build
# =============================================================================
#
# The native build compiles TeX Live's web2c tools (tangle, otangle, ctangle,
# tie, etc.) using the host's native C compiler, then uses them to convert
# pdfTeX's WEB sources into C files.

.PHONY: native-configure native-build wasm-configure wasm-build dist all clean

native-configure:
	@echo "========================================"
	@echo "Phase 1a: Native configure"
	@echo "========================================"
	@echo ""
	@echo "Running TeX Live top-level configure for native build."
	@echo "This sets up the build system and generates Makefiles."
	@echo ""
	cd $(BUILD_NATIVE) && \
		$(TEXLIVE_SRC)/configure \
			$(COMMON_CONFIGURE_FLAGS) \
			--disable-xetex \
			--disable-luatex
	@echo ""
	@echo "Native configure complete."

native-build:
	@echo "========================================"
	@echo "Phase 1b: Native build (web2c C generation)"
	@echo "========================================"
	@echo ""
	@echo "Building entire TeX Live natively (recursive make from top level)."
	@echo "This configures + builds all subdirectories including kpathsea"
	@echo "and web2c, generating the pdfTeX C sources we need."
	@echo ""
	# The top-level make handles recursive configure of subdirectories
	# (texk/kpathsea, texk/web2c, libs/zlib, libs/libpng, etc.) then builds them.
	# This is required because the TeX Live build system uses recursive autoconf.
	# The full build WILL fail on luajittex (missing hb.h) — that's expected.
	# With -j parallelism, pdftex C files may not be generated before abort.
	# MAKEINFO=true skips documentation (makeinfo may not be installed).
	-cd $(BUILD_NATIVE) && $(MAKE) MAKEINFO=true -j$$(nproc) 2>&1 || true
	@echo ""
	@echo "--- Full native build finished (errors in luajittex expected) ---"
	@echo ""
	# If pdftex C files weren't generated (parallel build race with luajittex
	# failure), retry with a targeted build of just pdftex in web2c.
	# At this point all subdirectories are configured and libs are built.
	@if [ ! -f "$(BUILD_NATIVE)/texk/web2c/pdftex0.c" ]; then \
		echo "--- pdftex C files not found, retrying targeted pdftex build ---"; \
		cd $(BUILD_NATIVE)/texk/web2c && $(MAKE) pdftex -j$$(nproc) 2>&1 || true; \
	fi
	@echo ""
	# Verify the generated files exist
	@echo "Checking for generated C files..."
	@ls -la $(BUILD_NATIVE)/texk/web2c/pdftex0.c \
		$(BUILD_NATIVE)/texk/web2c/pdftexini.c \
		$(BUILD_NATIVE)/texk/web2c/pdftex-pool.c \
		$(BUILD_NATIVE)/texk/web2c/pdftexd.h \
		2>/dev/null || (echo "ERROR: Generated C files not found!" && exit 1)
	@echo ""
	@echo "Native build complete. Generated files ready for WASM phase."


# =============================================================================
# Phase 2: WASM Build
# =============================================================================
#
# The WASM build runs configure through emconfigure to set up Emscripten's
# cross-compilation environment, then replaces the (incorrectly generated)
# web2c C files with the ones from the native build, and compiles everything
# with emcc.

wasm-configure:
	@echo "========================================"
	@echo "Phase 2a: WASM configure (emconfigure)"
	@echo "========================================"
	@echo ""
	@echo "Running TeX Live configure through emconfigure."
	@echo "This generates correct c-auto.h and config headers for WASM."
	@echo ""
	cd $(BUILD_WASM) && \
		emconfigure $(TEXLIVE_SRC)/configure \
			$(COMMON_CONFIGURE_FLAGS) \
			--host=wasm32-unknown-emscripten \
			--build=x86_64-pc-linux-gnu
	@echo ""
	@echo "WASM configure complete."

wasm-build: wasm-libs wasm-prep wasm-compile

# wasm-libs: Build WASM static libraries.
# Step 1: Recursive make builds kpathsea + zlib (stops at web2c failure).
# Step 2: Build libpng and xpdf explicitly (recursive make doesn't reach them).
wasm-libs:
	@echo "========================================"
	@echo "Phase 2b: WASM libraries"
	@echo "========================================"
	@echo ""
	@echo "--- Step 2b.1: Recursive make (kpathsea + zlib) ---"
	-cd $(BUILD_WASM) && emmake $(MAKE) MAKEINFO=true -j1 || true
	@echo ""
	@echo "--- Step 2b.2: Build libpng ---"
	@if [ ! -f "$(BUILD_WASM)/libs/libpng/libpng.a" ]; then \
		echo "Configuring libpng..."; \
		cd $(BUILD_WASM) && \
		if [ ! -f "libs/libpng/Makefile" ]; then \
			mkdir -p libs/libpng && cd libs/libpng && \
			emconfigure $(TEXLIVE_SRC)/libs/libpng/configure \
				--host=wasm32-unknown-emscripten \
				--build=x86_64-pc-linux-gnu \
				--disable-shared --enable-static \
				--with-zlib-include=$(TEXLIVE_SRC)/libs/zlib/zlib-src \
				--with-zlib-libdir=$(BUILD_WASM)/libs/zlib \
				CPPFLAGS="-I$(TEXLIVE_SRC)/libs/zlib/zlib-src -I$(BUILD_WASM)/libs/zlib"; \
		fi && \
		cd $(BUILD_WASM)/libs/libpng && emmake $(MAKE) -j1; \
	else \
		echo "libpng already built."; \
	fi
	@echo ""
	@echo "--- Step 2b.3: Build xpdf ---"
	@if [ ! -f "$(BUILD_WASM)/libs/xpdf/.libs/libxpdf.a" ] && [ ! -f "$(BUILD_WASM)/libs/xpdf/libxpdf.a" ]; then \
		echo "Configuring xpdf..."; \
		cd $(BUILD_WASM) && \
		if [ ! -f "libs/xpdf/Makefile" ]; then \
			mkdir -p libs/xpdf && cd libs/xpdf && \
			emconfigure $(TEXLIVE_SRC)/libs/xpdf/configure \
				--host=wasm32-unknown-emscripten \
				--build=x86_64-pc-linux-gnu \
				--disable-shared --enable-static; \
		fi && \
		cd $(BUILD_WASM)/libs/xpdf && emmake $(MAKE) -j1; \
	else \
		echo "xpdf already built."; \
	fi
	@echo ""
	@echo "--- Verifying WASM libraries ---"
	@find $(BUILD_WASM) -name 'libkpathsea.a' -o -name 'libz.a' -o -name 'libpng.a' -o -name 'libxpdf.a' 2>/dev/null | head -20
	# grep must consume the full symbol list: grep -q + pipefail can turn a match
	# into a false failure when the producer receives SIGPIPE.
	@echo "--- Verifying interposition contract: kpse_find_file is wrappable ---"
	@KP=$$(find $(BUILD_WASM) -name 'libkpathsea.a' 2>/dev/null | head -1); \
	if [ -z "$$KP" ]; then echo "ERROR: libkpathsea.a not built — cannot verify the --wrap=kpse_find_file target" >&2; exit 1; fi; \
	NM=""; command -v llvm-nm >/dev/null 2>&1 && NM=llvm-nm; \
	[ -z "$$NM" ] && command -v emnm >/dev/null 2>&1 && NM=emnm; \
	if [ -z "$$NM" ] && command -v em-config >/dev/null 2>&1; then \
		L=$$(em-config LLVM_ROOT 2>/dev/null || true); [ -n "$$L" ] && [ -x "$$L/llvm-nm" ] && NM="$$L/llvm-nm"; \
	fi; \
	if [ -n "$$NM" ]; then \
		S=$$("$$NM" "$$KP" 2>/dev/null || true); \
		if [ -n "$$S" ] && ! printf '%s\n' "$$S" | grep -w kpse_find_file >/dev/null; then \
			echo "ERROR: kpse_find_file not defined in $$KP — -Wl,--wrap=kpse_find_file would no-op" >&2; \
			echo "       silently (upstream renamed/removed it); the CDN hook (kpse-hook.c) never fires." >&2; \
			echo "       See docs/texlive-upgrade.md#upstream-maintenance-interpose-dont-patch" >&2; \
			exit 1; \
		fi; \
		echo "  kpse_find_file wrap-target ok (or skipped: nm read no symbols)"; \
	else \
		echo "  note: no wasm-capable nm (llvm-nm/emnm); skipping kpse_find_file wrap-symbol check"; \
	fi

# wasm-prep: Copy native-generated C files into WASM build tree and fix configs.
wasm-prep:
	@echo "========================================"
	@echo "Phase 2c: Prepare native files"
	@echo "========================================"
	@mkdir -p $(BUILD_WASM)/texk/web2c/w2c
	# Copy c-auto.h from the native build — it MUST exist (native web2c configure
	# emits it). A missing header means the native phase silently changed: fail loud
	# rather than build a header-less wasm. (interpose-don't-patch: guard the
	# interposition assumptions — docs/texlive-upgrade.md#upstream-maintenance-interpose-dont-patch)
	@if [ ! -f "$(BUILD_NATIVE)/texk/web2c/w2c/c-auto.h" ]; then \
		echo "ERROR: native c-auto.h missing ($(BUILD_NATIVE)/texk/web2c/w2c/c-auto.h)" >&2; \
		echo "       native web2c configure no longer emits it — interposition contract drift." >&2; \
		exit 1; \
	fi
	cp $(BUILD_NATIVE)/texk/web2c/w2c/c-auto.h $(BUILD_WASM)/texk/web2c/w2c/
	# Fix SIZEOF_LONG: native=8 (x86_64), WASM=4 (wasm32). A bare sed would no-op
	# SILENTLY if upstream stops emitting this exact define, yielding a broken
	# 64-bit-assuming wasm32 build. Assert the pattern pre-sed and the result post-sed.
	@CAUTO="$(BUILD_WASM)/texk/web2c/w2c/c-auto.h"; \
	if ! grep -q '#define SIZEOF_LONG 8' "$$CAUTO"; then \
		echo "ERROR: '#define SIZEOF_LONG 8' not present in $$CAUTO — the wasm32 fixup would" >&2; \
		echo "       no-op silently. Upstream c-auto.h layout changed; inspect and update the fixup" >&2; \
		echo "       (docs/texlive-upgrade.md#upstream-maintenance-interpose-dont-patch):" >&2; \
		grep -n 'SIZEOF_LONG' "$$CAUTO" >&2 || echo "       (no SIZEOF_LONG line at all)" >&2; \
		exit 1; \
	fi; \
	sed -i 's/#define SIZEOF_LONG 8/#define SIZEOF_LONG 4/' "$$CAUTO"; \
	if grep -q '#define SIZEOF_LONG 8' "$$CAUTO" || ! grep -q '#define SIZEOF_LONG 4' "$$CAUTO"; then \
		echo "ERROR: SIZEOF_LONG fixup post-condition failed in $$CAUTO" >&2; exit 1; \
	fi; \
	echo "  Fixed SIZEOF_LONG in c-auto.h for wasm32 (verified 8 -> 4)"
	# Copy aconf.h from native xpdf build
	@mkdir -p $(BUILD_WASM)/libs/xpdf
	-cp $(BUILD_NATIVE)/libs/xpdf/aconf.h $(BUILD_WASM)/libs/xpdf/ 2>/dev/null
	@echo "  Copied aconf.h from native build"
	# Copy generated C files
	cp $(BUILD_NATIVE)/texk/web2c/pdftex0.c     $(BUILD_WASM)/texk/web2c/
	cp $(BUILD_NATIVE)/texk/web2c/pdftexini.c    $(BUILD_WASM)/texk/web2c/
	cp $(BUILD_NATIVE)/texk/web2c/pdftex-pool.c  $(BUILD_WASM)/texk/web2c/
	cp $(BUILD_NATIVE)/texk/web2c/pdftexd.h      $(BUILD_WASM)/texk/web2c/
	-cp $(BUILD_NATIVE)/texk/web2c/pdftexcoerce.h $(BUILD_WASM)/texk/web2c/ 2>/dev/null
	@echo "  Native C files copied."

# wasm-compile: Final emcc step — compile pdfTeX + SyncTeX to WASM.
wasm-compile:
	@echo "========================================"
	@echo "Phase 2d: Final emcc compile"
	@echo "========================================"
	@echo ""
	@echo "--- Compiling pdfTeX WASM ---"
	cd $(WEB2C_BUILD) && \
		emcc $(EMCC_FLAGS) \
		$(SYNCTEX_REDEFINE) \
		-DHAVE_CONFIG_H \
		-DSYNCTEX_ENGINE_H='"synctex-pdftex.h"' \
		-I$(WEB2C_BUILD) \
		-I$(WEB2C_BUILD)/w2c \
		-I$(WEB2C_SRC) \
		-I$(WEB2C_SRC)/w2c \
		-I$(WEB2C_SRC)/pdftexdir \
		-I$(WEB2C_SRC)/synctexdir \
		-I$(WEB2C_SRC)/lib \
		-I$(WEB2C_SRC)/libmd5 \
		-I$(BUILD_WASM)/texk/kpathsea \
		-I$(TEXLIVE_SRC)/texk/kpathsea \
		-I$(TEXLIVE_SRC)/texk \
		-I$(BUILD_WASM)/texk \
		-I$(TEXLIVE_SRC)/libs/zlib/zlib-src \
		-I$(BUILD_WASM)/libs/zlib \
		-I$(TEXLIVE_SRC)/libs/libpng/libpng-src \
		-I$(BUILD_WASM)/libs/libpng \
		-I$(TEXLIVE_SRC)/libs/xpdf \
		-I$(TEXLIVE_SRC)/libs/xpdf/xpdf-src \
		-I$(TEXLIVE_SRC)/libs/xpdf/xpdf-src/goo \
		-I$(TEXLIVE_SRC)/libs/xpdf/xpdf-src/xpdf \
		-I$(BUILD_WASM)/libs/xpdf \
		-I$(BUILD_NATIVE)/libs/xpdf \
		pdftex0.c \
		pdftexini.c \
		pdftex-pool.c \
		$(WEB2C_SRC)/synctexdir/synctex.c \
		$(WEB2C_SRC)/libmd5/md5.c \
		$(WEB2C_LIB_SOURCES) \
		$(PDFTEX_C_SOURCES) \
		$(PDFTEX_CXX_SOURCES) \
		$(WASM_ENTRY) \
		$(KPSE_HOOK) \
		$(TRACE_HOOK) \
		$$(find $(BUILD_WASM) -name 'libkpathsea.a' | head -1) \
		$$(find $(BUILD_WASM) -name 'libz.a' | head -1) \
		$$(find $(BUILD_WASM) -name 'libpng.a' | head -1) \
		$$(find $(BUILD_WASM) -name 'libxpdf.a' | head -1) \
		-o $(DIST)/wasmtex-pdftex.js
	@test -s $(DIST)/wasmtex-pdftex.map || { echo "pdfTeX link map was not generated" >&2; exit 1; }
	@if grep -E 'libpplib|pp(doc|dict|array|stream|ref|xref)_' $(DIST)/wasmtex-pdftex.map; then \
		echo "ERROR: forbidden pplib archive or symbol remains in the pdfTeX link map" >&2; exit 1; \
	fi
	cp $(PDFTEX_WORKER) $(DIST)/wasmtex-pdftex.worker.js
	cp $(KPSE_RESOLVE) $(DIST)/wasmtex-kpse-resolve.js
	cp /src/resolver-evidence.js $(DIST)/wasmtex-resolver-evidence.js
	@echo ""
	@echo "WASM compilation complete."

# =============================================================================
# Packaging
# =============================================================================

dist:
	@echo "========================================"
	@echo "Packaging output"
	@echo "========================================"
	@echo ""
	# The emcc step already outputs to /dist. Verify files are there.
	@if [ -f "$(DIST)/wasmtex-pdftex.worker.js" ] && [ -f "$(DIST)/wasmtex-pdftex.js" ] && [ -f "$(DIST)/wasmtex-pdftex.wasm" ]; then \
		echo "Build artifacts:"; \
		ls -lh $(DIST)/wasmtex-pdftex.*; \
		echo ""; \
		echo "SUCCESS: pdfTeX WASM with SyncTeX built successfully."; \
		echo ""; \
		echo "To use in the editor, copy these files to public/wasmtex/:"; \
		echo "  cp dist/wasmtex-pdftex.* ../public/wasmtex/"; \
	else \
		echo "ERROR: Build artifacts not found in $(DIST)/"; \
		echo "Check the build log above for errors."; \
		exit 1; \
	fi

# =============================================================================
# Top-level targets
# =============================================================================

# =============================================================================
# BibTeX WASM Build (separate binary)
# =============================================================================
#
# BibTeX is built as a separate WASM binary to avoid web2c symbol conflicts
# with pdfTeX. It shares kpathsea infrastructure but is much smaller
# (no PDF/image/SyncTeX support needed).
#
# Phase 1 must be rebuilt with --enable-bibtex to generate bibtex C files.
# The Dockerfile Phase 1 commands need updating to match COMMON_CONFIGURE_FLAGS.

BIBTEX_ENTRY   = /src/bibtex-entry.c
BIBTEX_WORKER  = /src/bibtex-worker.js

BIBTEX_EMCC_FLAGS = \
	-O2 \
	-sEMIT_EMSCRIPTEN_LICENSE=1 \
	-Wno-implicit-function-declaration \
	-sALLOW_MEMORY_GROWTH=1 \
	-sFORCE_FILESYSTEM=1 \
	-sEXIT_RUNTIME=0 \
	-sINVOKE_RUN=0 \
	-sMODULARIZE=0 \
	-sEXPORTED_FUNCTIONS='["_compileBibtex","_main","_setMainEntry","_malloc","_free"]' \
	-sEXPORTED_RUNTIME_METHODS='["UTF8ToString","FS"]' \
	-sINITIAL_MEMORY=67108864 \
	-sWASM=1 \
	--js-library $(JSLIB) \
	-Wl,--wrap=kpse_find_file \
	-Wl,-Map=$(DIST)/wasmtex-bibtex.map

bibtex-wasm-prep:
	@echo "========================================"
	@echo "BibTeX: Prepare WASM sources"
	@echo "========================================"
	# Copy bibtex C files from native build (Phase 1 with --enable-bibtex)
	# bibtex only generates bibtex.c + bibtex.h (no -pool.c or d.h like pdftex)
	-cp $(BUILD_NATIVE)/texk/web2c/bibtex.c $(BUILD_WASM)/texk/web2c/ 2>/dev/null
	-cp $(BUILD_NATIVE)/texk/web2c/bibtex.h $(BUILD_WASM)/texk/web2c/ 2>/dev/null
	@echo "--- Native bibtex files available ---"
	@ls -la $(BUILD_NATIVE)/texk/web2c/bibtex* 2>/dev/null || echo "  (none found in native build)"
	@echo "--- Copied to WASM build ---"
	@ls -la $(BUILD_WASM)/texk/web2c/bibtex* 2>/dev/null || \
		echo "WARNING: bibtex C files not found. Phase 1 needs --enable-bibtex."

bibtex-wasm-compile: bibtex-wasm-prep
	@echo "========================================"
	@echo "BibTeX: WASM compile"
	@echo "========================================"
	cd $(WEB2C_BUILD) && \
		emcc $(BIBTEX_EMCC_FLAGS) \
		-DHAVE_CONFIG_H \
		-I$(WEB2C_BUILD) \
		-I$(WEB2C_BUILD)/w2c \
		-I$(WEB2C_SRC) \
		-I$(WEB2C_SRC)/w2c \
		-I$(WEB2C_SRC)/lib \
		-I$(BUILD_WASM)/texk/kpathsea \
		-I$(TEXLIVE_SRC)/texk/kpathsea \
		-I$(TEXLIVE_SRC)/texk \
		-I$(BUILD_WASM)/texk \
		bibtex.c \
		$(WEB2C_LIB_SOURCES) \
		$(WEB2C_SRC)/lib/main.c \
		$(BIBTEX_ENTRY) \
		$(KPSE_HOOK) \
		$$(find $(BUILD_WASM) -name 'libkpathsea.a' | head -1) \
		-o $(DIST)/wasmtex-bibtex.js
	@test -s $(DIST)/wasmtex-bibtex.map || { echo "BibTeX link map was not generated" >&2; exit 1; }
	@if grep -E 'libpplib|pp(doc|dict|array|stream|ref|xref)_' $(DIST)/wasmtex-bibtex.map; then \
		echo "ERROR: forbidden pplib archive or symbol remains in the BibTeX link map" >&2; exit 1; \
	fi
	cp $(BIBTEX_WORKER) $(DIST)/wasmtex-bibtex.worker.js
	@echo "BibTeX WASM compilation complete."

# =============================================================================
# Top-level targets
# =============================================================================

all: native-configure native-build wasm-configure wasm-build dist

all-with-bibtex: all bibtex-wasm-compile

clean:
	rm -rf $(BUILD_NATIVE) $(BUILD_WASM)
	mkdir -p $(BUILD_NATIVE) $(BUILD_WASM)
