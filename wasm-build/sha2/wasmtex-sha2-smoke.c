/* SPDX-License-Identifier: MIT */
#include "wasmtex-sha2.h"

#include <stdio.h>
#include <string.h>

static int check(const uint8_t *actual, size_t size, const char *expected)
{
    static const char hex[] = "0123456789abcdef";
    char rendered[129];
    size_t index;
    for (index = 0; index < size; ++index) {
        rendered[index * 2] = hex[actual[index] >> 4];
        rendered[index * 2 + 1] = hex[actual[index] & 15];
    }
    rendered[size * 2] = '\0';
    return strcmp(rendered, expected) == 0;
}

int main(void)
{
    uint8_t digest[64];
    static const char sha256_long[] =
        "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";
    static const char sha512_long[] =
        "abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmn"
        "hijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu";
    wasmtex_sha256("abc", 3, digest);
    if (!check(digest, 32,
               "ba7816bf8f01cfea414140de5dae2223"
               "b00361a396177a9cb410ff61f20015ad")) {
        return 1;
    }
    wasmtex_sha384("abc", 3, digest);
    if (!check(digest, 48,
               "cb00753f45a35e8bb5a03d699ac65007"
               "272c32ab0eded1631a8b605a43ff5bed"
               "8086072ba1e7cc2358baeca134c825a7")) {
        return 2;
    }
    wasmtex_sha512("abc", 3, digest);
    if (!check(digest, 64,
               "ddaf35a193617abacc417349ae204131"
               "12e6fa4e89a97ea20a9eeee64b55d39a"
               "2192992a274fc1a836ba3c23a3feebbd"
               "454d4423643ce80e2a9ac94fa54ca49f")) {
        return 3;
    }
    wasmtex_sha256(sha256_long, strlen(sha256_long), digest);
    if (!check(digest, 32,
               "248d6a61d20638b8e5c026930c3e6039"
               "a33ce45964ff2167f6ecedd419db06c1")) {
        return 4;
    }
    wasmtex_sha384(sha512_long, strlen(sha512_long), digest);
    if (!check(digest, 48,
               "09330c33f71147e83d192fc782cd1b47"
               "53111b173b3b05d22fa08086e3b0f712"
               "fcc7c71a557e2db966c3e9fa91746039")) {
        return 5;
    }
    wasmtex_sha512(sha512_long, strlen(sha512_long), digest);
    if (!check(digest, 64,
               "8e959b75dae313da8cf4f72814fc143f"
               "8f7779c6eb9f7fa17299aeadb6889018"
               "501d289e4900f7e4331b99dec4b5433a"
               "c7d329eeb6dd26545e96e55b874be909")) {
        return 6;
    }
    puts("WasmTex SHA-2 smoke test passed");
    return 0;
}
