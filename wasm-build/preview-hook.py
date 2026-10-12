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
    + "  { curchr = 0; goto lab10; }\n"
    + source[match.start(2):]
)
path.write_text(source)
