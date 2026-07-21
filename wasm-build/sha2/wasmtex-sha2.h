/* SPDX-License-Identifier: MIT */
#ifndef WASMTEX_SHA2_H
#define WASMTEX_SHA2_H

#include <stddef.h>
#include <stdint.h>

void wasmtex_sha256(const void *data, size_t size, uint8_t digest[32]);
void wasmtex_sha384(const void *data, size_t size, uint8_t digest[48]);
void wasmtex_sha512(const void *data, size_t size, uint8_t digest[64]);

#endif
