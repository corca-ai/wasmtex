#!/usr/bin/env python3
"""Compile the index against the real hash-table code in a supplied TeX Live source tree."""
import argparse
import hashlib
from pathlib import Path
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument('--source', required=True, type=Path, help='Directory containing dpxutil.c and dpxutil.h')
parser.add_argument('--map', type=Path)
parser.add_argument('--sanitize', action='store_true')
parser.add_argument('--cc', default='clang')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
source = (args.source / 'dpxutil.c').read_text()
header = (args.source / 'dpxutil.h').read_text()
# Extract actual upstream definitions, retaining their order and implementation.
# Marker drift must stop the test instead of silently using an independent model.
start = source.index('void\nht_init_table (')
end = source.index('static int\nread_c_escchar (', start)
hstart = header.index('#define HASH_TABLE_SIZE ')
hend = header.index('extern char *parse_float_decimal', hstart)
assert source.count('void\nht_init_table (') == 1
prefix = '''#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define ASSERT(x) assert(x)
static void *checked_alloc(size_t n) { void *p = malloc(n ? n : 1); assert(p); return p; }
#define NEW(n,t) ((t *)checked_alloc((n)*sizeof(t)))
#define RELEASE(p) free(p)
'''
with tempfile.TemporaryDirectory(prefix='fontmap-index-') as tmp:
    unit = Path(tmp) / 'test.c'
    unit.write_text(prefix + header[hstart:hend] + source[start:end]
                    + (root / 'wasm-build/fontmap-index/test-index.c').read_text())
    binary = Path(tmp) / 'test'
    flags = ['-g', '-O1', '-fsanitize=address,undefined', '-fno-omit-frame-pointer'] if args.sanitize else ['-O2']
    subprocess.run([args.cc, '-std=c99', *flags, '-I', str(root / 'wasm-build/fontmap-index'), str(unit), '-o', str(binary)], check=True)
    subprocess.run([str(binary), *([str(args.map.resolve())] if args.map else [])], check=True, timeout=60)
print('upstream dpxutil.c sha256:', hashlib.sha256(source.encode()).hexdigest())
