#include <zlib.h>
#include <fcntl.h>
#include <unistd.h>
#include <stdlib.h>
int probe_open(const char *path) { return (int)gzdopen(open(path, O_RDONLY), "rb"); }
int probe_read(int f, void *p, unsigned n) { return gzread((gzFile)f,p,n); }
int probe_close(int f) { return gzclose((gzFile)f); }
