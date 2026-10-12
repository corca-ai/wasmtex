"""Install the bounded-preview exit in web2c's generated main_control.

Keep the upstream WEB source and format layout unchanged. Refuse an unfamiliar
code generator output instead of silently building an engine without the exit.
"""
import pathlib
import re
import sys

path = pathlib.Path(sys.argv[1])
source = path.read_text()
start = source.index("maincontrol ( void )")
switch = re.compile(r"(lab60:\s*)(getxtoken\s*\(\s*\)\s*;)")
match = switch.search(source, start)
if match is None:
    raise SystemExit("pdfTeX main_control entry changed: review the preview hook")
source = (
    "extern int wasmtex_preview_page_limit;\n"
    + source[:match.start(2)]
    + "if (wasmtex_preview_page_limit > 0 && totalpages >= wasmtex_preview_page_limit)\n"
    + "  { curchr = 0; return; }\n"
    + source[match.start(2):]
)
# A partial run can be inside an output routine, alignment or macro expansion.
# final_cleanup assumes a scanned \end and unwinds those token stacks; that is
# not valid here. The next request restores the heap and the worker closes all
# streams. Keep close_files_and_terminate, which finalizes fonts and PDF xref.
ini_path = path.with_name("pdftexini.c")
ini = ini_path.read_text()
pattern = r"\bfinalcleanup\s*\(\s*\)\s*;"
replacement = "if (!(wasmtex_preview_page_limit > 0 && totalpages >= wasmtex_preview_page_limit)) finalcleanup ();"
source, count = re.subn(pattern, replacement, source)
ini, ini_count = re.subn(pattern, replacement, ini)
if count + ini_count != 1:
    raise SystemExit("pdfTeX final cleanup entry changed: review the preview hook")
path.write_text(source)
if ini_count:
    ini_path.write_text("extern int wasmtex_preview_page_limit;\n" + ini)
