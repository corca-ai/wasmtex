#!/usr/bin/env python3
"""Run the real upstream font-map insertion failure before and after the fix.

Only the external SFD resolver is substituted: it reports an absent file. The
insertion, name parsing, allocation, record copying and table lifecycle are the
actual supplied upstream definitions. This is not a replacement table model.
"""
import argparse
import hashlib
from pathlib import Path
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument('--source', required=True, type=Path)
parser.add_argument('--sanitize', action='store_true')
parser.add_argument('--cc', default='clang')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
original = (args.source / 'fontmap.c').read_text()
util = (args.source / 'dpxutil.c').read_text()
util_header = (args.source / 'dpxutil.h').read_text()
map_header = (args.source / 'fontmap.h').read_text()

def function(source, name):
    marker = '\n' + name + ' ('
    assert source.count(marker) == 1, 'Function marker drift: ' + name
    pos = source.index(marker) + 1
    start = source.rfind('\n', 0, pos - 1) + 1
    end = source.index('\n}', pos) + 2
    return source[start:end] + '\n'

prefix = r'''
#include <assert.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define ASSERT(x) assert(x)
#define NEW(n,t) ((t *)malloc((n)*sizeof(t)))
#define RELEASE(p) free(p)
#define MESG(...) ((void)0)
static struct { int verbose_level; } dpx_conf = {0};
static char warning[256];
static unsigned warnings;
static void capture_warning(const char *format, ...) {
  va_list ap; va_start(ap, format);
  vsnprintf(warning, sizeof(warning), format, ap);
  va_end(ap); warnings++;
}
#define WARN capture_warning
static char **sfd_get_subfont_ids(const char *name, int *count) {
  assert(!strcmp(name, "MissingSFD")); *count = 0; return NULL;
}
static void release_sfd_record(void) {}
'''
main = r'''
int main(void) {
  unsigned cycle, i;
  for (cycle = 0; cycle < 3; cycle++) {
    fontmap_rec rec;
    pdf_init_fontmaps();
    pdf_init_fontmap_record(&rec);
    rec.map_name = mstrdup("dummy@MissingSFD@");
    rec.font_name = mstrdup("cmr10");
    for (i = 0; i < 4; i++) {
      warnings = 0;
      assert(pdf_insert_fontmap_record(rec.map_name, &rec) == NULL);
      assert(warnings == 1);
      assert(!strcmp(warning, "Could not open SFD file: MissingSFD"));
      assert(fontmap->count == 0);
    }
    pdf_clear_fontmap_record(&rec);
    rec.map_name = mstrdup("cmr10");
    rec.font_name = mstrdup("cmr10");
    assert(pdf_insert_fontmap_record(rec.map_name, &rec));
    assert(fontmap->count == 1);
    assert(ht_lookup_table(fontmap, "cmr10", 5));
    pdf_clear_fontmap_record(&rec);
    pdf_close_fontmaps();
  }
  puts("PASS: exact missing-SFD warning, repeated failures, recovery and teardown");
  return 0;
}
'''

def unit(source):
    table_header = util_header[util_header.index('#define HASH_TABLE_SIZE '):util_header.index('extern char *parse_float_decimal')]
    table_code = util[util.index('void\nht_init_table ('):util.index('static int\nread_c_escchar (')]
    declarations = source[source.index('static struct ht_table *fontmap = NULL;'):source.index('static char *\nchop_sfd_name (')]
    functions = ''.join(function(source, name) for name in [
        'pdf_init_fontmap_record', 'pdf_clear_fontmap_record', 'mstrdup',
        'pdf_copy_fontmap_record', 'hval_free', 'chop_sfd_name',
        'make_subfont_name', 'pdf_insert_fontmap_record', 'pdf_init_fontmaps',
        'pdf_close_fontmaps'])
    return prefix + map_header + table_header + table_code + declarations + functions + main

with tempfile.TemporaryDirectory(prefix='missing-sfd-') as tmp:
    directory = Path(tmp)
    target = directory / 'texk/dvipdfm-x/fontmap.c'
    target.parent.mkdir(parents=True)
    target.write_text(original)
    patch = root / 'wasm-build/dvipdfmx-fixes/missing-sfd.patch'
    subprocess.run(['git', 'apply', '--check', str(patch)], cwd=directory, check=True)
    subprocess.run(['git', 'apply', str(patch)], cwd=directory, check=True)
    for label, source in [('upstream', original), ('fixed', target.read_text())]:
        cfile = directory / (label + '.c'); cfile.write_text(unit(source))
        binary = directory / label
        flags = ['-g', '-O1', '-fsanitize=address,undefined', '-fno-omit-frame-pointer'] if args.sanitize else ['-O0']
        subprocess.run([args.cc, '-std=c99', *flags, str(cfile), '-o', str(binary)], check=True)
        result = subprocess.run([str(binary)], capture_output=True, text=True, timeout=60)
        if label == 'upstream':
            assert result.returncode != 0, 'Unmodified upstream unexpectedly passed'
            if args.sanitize:
                assert 'heap-use-after-free' in result.stderr, result.stderr
            print('REPRODUCED upstream failure:', 'ASan heap-use-after-free' if args.sanitize else 'incorrect warning')
        else:
            assert result.returncode == 0, result.stderr
            print(result.stdout.strip())
print('upstream fontmap.c sha256:', hashlib.sha256(original.encode()).hexdigest())
