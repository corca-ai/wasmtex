/* SPDX-License-Identifier: MIT */
#include "wasmtex-sha2.h"

#include <string.h>

typedef struct {
    uint32_t state[8];
    uint64_t total;
    uint8_t buffer[64];
    size_t buffered;
} wasmtex_sha256_state;

typedef struct {
    uint64_t state[8];
    uint64_t total;
    uint8_t buffer[128];
    size_t buffered;
} wasmtex_sha512_state;

static const uint32_t sha256_constants[64] = {
    0x428a2f98U, 0x71374491U, 0xb5c0fbcfU, 0xe9b5dba5U,
    0x3956c25bU, 0x59f111f1U, 0x923f82a4U, 0xab1c5ed5U,
    0xd807aa98U, 0x12835b01U, 0x243185beU, 0x550c7dc3U,
    0x72be5d74U, 0x80deb1feU, 0x9bdc06a7U, 0xc19bf174U,
    0xe49b69c1U, 0xefbe4786U, 0x0fc19dc6U, 0x240ca1ccU,
    0x2de92c6fU, 0x4a7484aaU, 0x5cb0a9dcU, 0x76f988daU,
    0x983e5152U, 0xa831c66dU, 0xb00327c8U, 0xbf597fc7U,
    0xc6e00bf3U, 0xd5a79147U, 0x06ca6351U, 0x14292967U,
    0x27b70a85U, 0x2e1b2138U, 0x4d2c6dfcU, 0x53380d13U,
    0x650a7354U, 0x766a0abbU, 0x81c2c92eU, 0x92722c85U,
    0xa2bfe8a1U, 0xa81a664bU, 0xc24b8b70U, 0xc76c51a3U,
    0xd192e819U, 0xd6990624U, 0xf40e3585U, 0x106aa070U,
    0x19a4c116U, 0x1e376c08U, 0x2748774cU, 0x34b0bcb5U,
    0x391c0cb3U, 0x4ed8aa4aU, 0x5b9cca4fU, 0x682e6ff3U,
    0x748f82eeU, 0x78a5636fU, 0x84c87814U, 0x8cc70208U,
    0x90befffaU, 0xa4506cebU, 0xbef9a3f7U, 0xc67178f2U
};

static const uint64_t sha512_constants[80] = {
    UINT64_C(0x428a2f98d728ae22), UINT64_C(0x7137449123ef65cd),
    UINT64_C(0xb5c0fbcfec4d3b2f), UINT64_C(0xe9b5dba58189dbbc),
    UINT64_C(0x3956c25bf348b538), UINT64_C(0x59f111f1b605d019),
    UINT64_C(0x923f82a4af194f9b), UINT64_C(0xab1c5ed5da6d8118),
    UINT64_C(0xd807aa98a3030242), UINT64_C(0x12835b0145706fbe),
    UINT64_C(0x243185be4ee4b28c), UINT64_C(0x550c7dc3d5ffb4e2),
    UINT64_C(0x72be5d74f27b896f), UINT64_C(0x80deb1fe3b1696b1),
    UINT64_C(0x9bdc06a725c71235), UINT64_C(0xc19bf174cf692694),
    UINT64_C(0xe49b69c19ef14ad2), UINT64_C(0xefbe4786384f25e3),
    UINT64_C(0x0fc19dc68b8cd5b5), UINT64_C(0x240ca1cc77ac9c65),
    UINT64_C(0x2de92c6f592b0275), UINT64_C(0x4a7484aa6ea6e483),
    UINT64_C(0x5cb0a9dcbd41fbd4), UINT64_C(0x76f988da831153b5),
    UINT64_C(0x983e5152ee66dfab), UINT64_C(0xa831c66d2db43210),
    UINT64_C(0xb00327c898fb213f), UINT64_C(0xbf597fc7beef0ee4),
    UINT64_C(0xc6e00bf33da88fc2), UINT64_C(0xd5a79147930aa725),
    UINT64_C(0x06ca6351e003826f), UINT64_C(0x142929670a0e6e70),
    UINT64_C(0x27b70a8546d22ffc), UINT64_C(0x2e1b21385c26c926),
    UINT64_C(0x4d2c6dfc5ac42aed), UINT64_C(0x53380d139d95b3df),
    UINT64_C(0x650a73548baf63de), UINT64_C(0x766a0abb3c77b2a8),
    UINT64_C(0x81c2c92e47edaee6), UINT64_C(0x92722c851482353b),
    UINT64_C(0xa2bfe8a14cf10364), UINT64_C(0xa81a664bbc423001),
    UINT64_C(0xc24b8b70d0f89791), UINT64_C(0xc76c51a30654be30),
    UINT64_C(0xd192e819d6ef5218), UINT64_C(0xd69906245565a910),
    UINT64_C(0xf40e35855771202a), UINT64_C(0x106aa07032bbd1b8),
    UINT64_C(0x19a4c116b8d2d0c8), UINT64_C(0x1e376c085141ab53),
    UINT64_C(0x2748774cdf8eeb99), UINT64_C(0x34b0bcb5e19b48a8),
    UINT64_C(0x391c0cb3c5c95a63), UINT64_C(0x4ed8aa4ae3418acb),
    UINT64_C(0x5b9cca4f7763e373), UINT64_C(0x682e6ff3d6b2b8a3),
    UINT64_C(0x748f82ee5defb2fc), UINT64_C(0x78a5636f43172f60),
    UINT64_C(0x84c87814a1f0ab72), UINT64_C(0x8cc702081a6439ec),
    UINT64_C(0x90befffa23631e28), UINT64_C(0xa4506cebde82bde9),
    UINT64_C(0xbef9a3f7b2c67915), UINT64_C(0xc67178f2e372532b),
    UINT64_C(0xca273eceea26619c), UINT64_C(0xd186b8c721c0c207),
    UINT64_C(0xeada7dd6cde0eb1e), UINT64_C(0xf57d4f7fee6ed178),
    UINT64_C(0x06f067aa72176fba), UINT64_C(0x0a637dc5a2c898a6),
    UINT64_C(0x113f9804bef90dae), UINT64_C(0x1b710b35131c471b),
    UINT64_C(0x28db77f523047d84), UINT64_C(0x32caab7b40c72493),
    UINT64_C(0x3c9ebe0a15c9bebc), UINT64_C(0x431d67c49c100d4c),
    UINT64_C(0x4cc5d4becb3e42b6), UINT64_C(0x597f299cfc657e2a),
    UINT64_C(0x5fcb6fab3ad6faec), UINT64_C(0x6c44198c4a475817)
};

static uint32_t rotr32(uint32_t value, unsigned int bits)
{
    return (value >> bits) | (value << (32U - bits));
}

static uint64_t rotr64(uint64_t value, unsigned int bits)
{
    return (value >> bits) | (value << (64U - bits));
}

static uint32_t load32be(const uint8_t *source)
{
    return ((uint32_t) source[0] << 24) | ((uint32_t) source[1] << 16) |
           ((uint32_t) source[2] << 8) | (uint32_t) source[3];
}

static uint64_t load64be(const uint8_t *source)
{
    return ((uint64_t) load32be(source) << 32) | load32be(source + 4);
}

static void store32be(uint8_t *target, uint32_t value)
{
    target[0] = (uint8_t) (value >> 24);
    target[1] = (uint8_t) (value >> 16);
    target[2] = (uint8_t) (value >> 8);
    target[3] = (uint8_t) value;
}

static void store64be(uint8_t *target, uint64_t value)
{
    store32be(target, (uint32_t) (value >> 32));
    store32be(target + 4, (uint32_t) value);
}

static void sha256_transform(wasmtex_sha256_state *state, const uint8_t block[64])
{
    uint32_t words[64];
    uint32_t a, b, c, d, e, f, g, h;
    size_t index;
    for (index = 0; index < 16; ++index) {
        words[index] = load32be(block + index * 4);
    }
    for (; index < 64; ++index) {
        uint32_t x = words[index - 15];
        uint32_t y = words[index - 2];
        uint32_t s0 = rotr32(x, 7) ^ rotr32(x, 18) ^ (x >> 3);
        uint32_t s1 = rotr32(y, 17) ^ rotr32(y, 19) ^ (y >> 10);
        words[index] = words[index - 16] + s0 + words[index - 7] + s1;
    }
    a = state->state[0]; b = state->state[1];
    c = state->state[2]; d = state->state[3];
    e = state->state[4]; f = state->state[5];
    g = state->state[6]; h = state->state[7];
    for (index = 0; index < 64; ++index) {
        uint32_t sum1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
        uint32_t choice = (e & f) ^ ((~e) & g);
        uint32_t first = h + sum1 + choice + sha256_constants[index] + words[index];
        uint32_t sum0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
        uint32_t majority = (a & b) ^ (a & c) ^ (b & c);
        uint32_t second = sum0 + majority;
        h = g; g = f; f = e; e = d + first;
        d = c; c = b; b = a; a = first + second;
    }
    state->state[0] += a; state->state[1] += b;
    state->state[2] += c; state->state[3] += d;
    state->state[4] += e; state->state[5] += f;
    state->state[6] += g; state->state[7] += h;
}

static void sha512_transform(wasmtex_sha512_state *state, const uint8_t block[128])
{
    uint64_t words[80];
    uint64_t a, b, c, d, e, f, g, h;
    size_t index;
    for (index = 0; index < 16; ++index) {
        words[index] = load64be(block + index * 8);
    }
    for (; index < 80; ++index) {
        uint64_t x = words[index - 15];
        uint64_t y = words[index - 2];
        uint64_t s0 = rotr64(x, 1) ^ rotr64(x, 8) ^ (x >> 7);
        uint64_t s1 = rotr64(y, 19) ^ rotr64(y, 61) ^ (y >> 6);
        words[index] = words[index - 16] + s0 + words[index - 7] + s1;
    }
    a = state->state[0]; b = state->state[1];
    c = state->state[2]; d = state->state[3];
    e = state->state[4]; f = state->state[5];
    g = state->state[6]; h = state->state[7];
    for (index = 0; index < 80; ++index) {
        uint64_t sum1 = rotr64(e, 14) ^ rotr64(e, 18) ^ rotr64(e, 41);
        uint64_t choice = (e & f) ^ ((~e) & g);
        uint64_t first = h + sum1 + choice + sha512_constants[index] + words[index];
        uint64_t sum0 = rotr64(a, 28) ^ rotr64(a, 34) ^ rotr64(a, 39);
        uint64_t majority = (a & b) ^ (a & c) ^ (b & c);
        uint64_t second = sum0 + majority;
        h = g; g = f; f = e; e = d + first;
        d = c; c = b; b = a; a = first + second;
    }
    state->state[0] += a; state->state[1] += b;
    state->state[2] += c; state->state[3] += d;
    state->state[4] += e; state->state[5] += f;
    state->state[6] += g; state->state[7] += h;
}

static void sha256_update(wasmtex_sha256_state *state, const uint8_t *data, size_t size)
{
    state->total += size;
    while (size != 0) {
        size_t room = sizeof(state->buffer) - state->buffered;
        size_t take = size < room ? size : room;
        memcpy(state->buffer + state->buffered, data, take);
        state->buffered += take;
        data += take;
        size -= take;
        if (state->buffered == sizeof(state->buffer)) {
            sha256_transform(state, state->buffer);
            state->buffered = 0;
        }
    }
}

static void sha512_update(wasmtex_sha512_state *state, const uint8_t *data, size_t size)
{
    state->total += size;
    while (size != 0) {
        size_t room = sizeof(state->buffer) - state->buffered;
        size_t take = size < room ? size : room;
        memcpy(state->buffer + state->buffered, data, take);
        state->buffered += take;
        data += take;
        size -= take;
        if (state->buffered == sizeof(state->buffer)) {
            sha512_transform(state, state->buffer);
            state->buffered = 0;
        }
    }
}

static void sha256_final(wasmtex_sha256_state *state, uint8_t digest[32])
{
    uint64_t bit_length = state->total * UINT64_C(8);
    size_t index;
    state->buffer[state->buffered++] = 0x80;
    if (state->buffered > 56) {
        memset(state->buffer + state->buffered, 0, 64 - state->buffered);
        sha256_transform(state, state->buffer);
        state->buffered = 0;
    }
    memset(state->buffer + state->buffered, 0, 56 - state->buffered);
    store64be(state->buffer + 56, bit_length);
    sha256_transform(state, state->buffer);
    for (index = 0; index < 8; ++index) {
        store32be(digest + index * 4, state->state[index]);
    }
}

static void sha512_final(wasmtex_sha512_state *state, uint8_t *digest, size_t words)
{
    uint64_t bit_length = state->total * UINT64_C(8);
    size_t index;
    state->buffer[state->buffered++] = 0x80;
    if (state->buffered > 112) {
        memset(state->buffer + state->buffered, 0, 128 - state->buffered);
        sha512_transform(state, state->buffer);
        state->buffered = 0;
    }
    memset(state->buffer + state->buffered, 0, 112 - state->buffered);
    memset(state->buffer + 112, 0, 8);
    store64be(state->buffer + 120, bit_length);
    sha512_transform(state, state->buffer);
    for (index = 0; index < words; ++index) {
        store64be(digest + index * 8, state->state[index]);
    }
}

void wasmtex_sha256(const void *data, size_t size, uint8_t digest[32])
{
    wasmtex_sha256_state state = {
        { 0x6a09e667U, 0xbb67ae85U, 0x3c6ef372U, 0xa54ff53aU,
          0x510e527fU, 0x9b05688cU, 0x1f83d9abU, 0x5be0cd19U },
        0, { 0 }, 0
    };
    sha256_update(&state, (const uint8_t *) data, size);
    sha256_final(&state, digest);
}

void wasmtex_sha384(const void *data, size_t size, uint8_t digest[48])
{
    wasmtex_sha512_state state = {
        { UINT64_C(0xcbbb9d5dc1059ed8), UINT64_C(0x629a292a367cd507),
          UINT64_C(0x9159015a3070dd17), UINT64_C(0x152fecd8f70e5939),
          UINT64_C(0x67332667ffc00b31), UINT64_C(0x8eb44a8768581511),
          UINT64_C(0xdb0c2e0d64f98fa7), UINT64_C(0x47b5481dbefa4fa4) },
        0, { 0 }, 0
    };
    sha512_update(&state, (const uint8_t *) data, size);
    sha512_final(&state, digest, 6);
}

void wasmtex_sha512(const void *data, size_t size, uint8_t digest[64])
{
    wasmtex_sha512_state state = {
        { UINT64_C(0x6a09e667f3bcc908), UINT64_C(0xbb67ae8584caa73b),
          UINT64_C(0x3c6ef372fe94f82b), UINT64_C(0xa54ff53a5f1d36f1),
          UINT64_C(0x510e527fade682d1), UINT64_C(0x9b05688c2b3e6c1f),
          UINT64_C(0x1f83d9abfb41bd6b), UINT64_C(0x5be0cd19137e2179) },
        0, { 0 }, 0
    };
    sha512_update(&state, (const uint8_t *) data, size);
    sha512_final(&state, digest, 8);
}
