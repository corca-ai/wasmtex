import { describe, expect, it, vi } from 'vitest'
import {
  formatSignature,
  getCommandPackage,
  getCommandSignature,
  getEnvironmentSignature,
  getShardEnvironments,
  parseSignature,
  registerShard,
} from '../package-db'
import { PackageShardLoader, type ShardStore } from '../package-shard-loader'

describe('parseSignature', () => {
  it('reads required arguments', () => {
    expect(parseSignature('\\frac{$1}{$2}')).toEqual([
      { kind: 'required', placeholder: '' },
      { kind: 'required', placeholder: '' },
    ])
  })

  it('distinguishes optional arguments', () => {
    expect(parseSignature('\\includegraphics[$1]{$2}')).toEqual([
      { kind: 'optional', placeholder: '' },
      { kind: 'required', placeholder: '' },
    ])
  })

  it('extracts named placeholders', () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: LaTeX snippet placeholder syntax, not a JS template
    const snippet = '\\href{${1:url}}{${2:text}}'
    expect(parseSignature(snippet)).toEqual([
      { kind: 'required', placeholder: 'url' },
      { kind: 'required', placeholder: 'text' },
    ])
  })

  it('returns no args for a bare command', () => {
    expect(parseSignature('\\item')).toEqual([])
  })

  it('stops at non-argument content (environments)', () => {
    expect(parseSignature('\\begin{document}\n\t$0\n\\end{document}')).toHaveLength(0)
  })

  it('does not drop the last char of an unclosed optional group', () => {
    // An unmatched `[` must keep the whole remainder (like the `{` case does);
    // chopping the final char here silently swallowed the trailing `$` and lost
    // the argument entirely.
    const args = parseSignature('\\foo[x$')
    expect(args).toHaveLength(1)
    expect(args[0]!.kind).toBe('optional')
  })
})

describe('formatSignature', () => {
  it('renders required and optional slots', () => {
    expect(
      formatSignature('cmd', [
        { kind: 'optional', placeholder: 'opt' },
        { kind: 'required', placeholder: 'x' },
      ]),
    ).toBe('\\cmd[opt]{x}')
  })
})

describe('bundled command DB lookups', () => {
  it('exposes typed resource and option domains for structural commands', () => {
    expect(getCommandSignature('documentclass')).toEqual([
      {
        kind: 'optional',
        placeholder: 'options',
        valueKind: 'key-value',
        keyFamily: 'class-options',
        list: true,
        selectorArgumentIndex: 1,
      },
      { kind: 'required', placeholder: 'class', valueKind: 'tex-class' },
    ])
  })

  it('returns a signature for a bundled command', () => {
    expect(getCommandSignature('frac')).toEqual([
      { kind: 'required', placeholder: '' },
      { kind: 'required', placeholder: '' },
    ])
  })

  it('attributes a command to its source package', () => {
    expect(getCommandPackage('dfrac')).toBe('amsmath') // \dfrac is amsmath
  })

  it('returns undefined package for kernel commands', () => {
    expect(getCommandPackage('section')).toBeUndefined()
    expect(getCommandPackage('frac')).toBeUndefined() // \frac is in the LaTeX kernel
  })

  it('returns undefined for an unknown command', () => {
    expect(getCommandSignature('totallymadeupcommand')).toBeUndefined()
  })
})

describe('registerShard', () => {
  it('makes shard commands resolvable', () => {
    registerShard({
      package: 'mypkg',
      commands: [{ name: 'fancycmd', args: [{ kind: 'required', placeholder: 'arg' }] }],
    })
    expect(getCommandPackage('fancycmd')).toBe('mypkg')
    expect(getCommandSignature('fancycmd')).toEqual([{ kind: 'required', placeholder: 'arg' }])
  })

  it('does not let a shard shadow a bundled kernel command', () => {
    // \section is a kernel command (no package). A shard re-declaring the same name
    // must not override the bundled DB — the kernel command stays authoritative.
    registerShard({ package: 'evilpkg', commands: [{ name: 'section', args: [] }] })
    expect(getCommandPackage('section')).toBeUndefined()
  })

  it('does not let a later shard clobber an earlier package’s same-named command', () => {
    // Two packages contributing the same command name: first writer wins, mirroring the
    // "bundled DB is authoritative / don't shadow" rule applied to kernel commands.
    registerShard({
      package: 'pkgFirst',
      commands: [{ name: 'collidecmd', args: [{ kind: 'required', placeholder: 'x' }] }],
    })
    registerShard({ package: 'pkgSecond', commands: [{ name: 'collidecmd', args: [] }] })
    expect(getCommandPackage('collidecmd')).toBe('pkgFirst')
    expect(getCommandSignature('collidecmd')).toEqual([{ kind: 'required', placeholder: 'x' }])
  })

  it('registers shard-contributed environments so they are queryable', () => {
    // PackageShard.environments is part of the public shard contract; it used to be parsed
    // and then silently dropped (no registry, no getter, no consumer).
    registerShard({
      package: 'envpkg',
      commands: [],
      environments: [{ name: 'myshardenv', args: [{ kind: 'optional', valueKind: 'key-value' }] }],
    })
    expect(getShardEnvironments().has('myshardenv')).toBe(true)
    expect(getEnvironmentSignature('myshardenv')).toEqual([
      { kind: 'optional', valueKind: 'key-value' },
    ])
  })

  it('does not throw on a malformed shard (non-array commands)', () => {
    // Defense in depth: the loader rejects malformed shards, but registerShard itself must
    // not crash if handed `commands`/`environments` that aren't arrays.
    expect(() =>
      registerShard({ package: 'broken' } as unknown as Parameters<typeof registerShard>[0]),
    ).not.toThrow()
  })

  it('skips a null/malformed array element instead of crashing, keeping valid siblings', () => {
    // asShard only guarantees commands/environments are ARRAYS, never that each element is a
    // valid object. A null element used to throw `Cannot read properties of null (reading
    // 'name')` inside registerShard, which propagated up through resolve()/load() and
    // rejected the whole best-effort loadAll() batch. The bad element must be skipped and
    // valid siblings still register.
    expect(() =>
      registerShard({
        package: 'badelem',
        commands: [
          null as unknown as { name: string },
          { name: 'realcmd', args: [{ kind: 'required', placeholder: 'x' }] },
        ],
        environments: [null as unknown as { name: string }, { name: 'realenv' }],
      }),
    ).not.toThrow()
    expect(getCommandPackage('realcmd')).toBe('badelem')
    expect(getShardEnvironments().has('realenv')).toBe(true)
  })
})

function memoryStore(): ShardStore & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    map,
    async get(k) {
      return map.get(k) ?? null
    },
    async set(k, v) {
      map.set(k, v)
    },
  }
}

function shardResponse(pkg: string): Response {
  return new Response(JSON.stringify({ package: pkg, commands: [{ name: `${pkg}cmd` }] }), {
    status: 200,
  })
}

describe('PackageShardLoader', () => {
  it('fetches only the requested packages, once each', async () => {
    const fetchImpl = vi.fn(async (url: string | URL) =>
      shardResponse(String(url).match(/\/(\w+)\.json/)![1]!),
    )
    const loader = new PackageShardLoader({
      baseUrl: 'https://cdn/x',
      fetchImpl: fetchImpl as never,
    })

    await loader.loadAll(['booktabs', 'siunitx'])
    await loader.load('booktabs') // already resolved — no extra fetch

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(getCommandPackage('booktabscmd')).toBe('booktabs')
  })

  it('fetches a package once even when requested concurrently/duplicated', async () => {
    const fetchImpl = vi.fn(async (url: string | URL) =>
      shardResponse(String(url).match(/\/(\w+)\.json/)![1]!),
    )
    const loader = new PackageShardLoader({
      baseUrl: 'https://cdn/x',
      fetchImpl: fetchImpl as never,
    })
    // Concurrent duplicates must share a single in-flight fetch.
    await Promise.all([loader.load('tikz'), loader.load('tikz'), loader.load('tikz')])
    await loader.loadAll(['tikz', 'tikz'])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('caches a fetched shard and serves it offline afterward', async () => {
    const store = memoryStore()
    const online = vi.fn(async (url: string | URL) =>
      shardResponse(String(url).match(/\/(\w+)\.json/)![1]!),
    )
    await new PackageShardLoader({
      baseUrl: 'https://cdn/x',
      fetchImpl: online as never,
      store,
    }).load('geometry')
    expect(store.map.size).toBe(1)

    // A second session with no network still resolves from the store.
    const offline = vi.fn(async () => {
      throw new Error('offline')
    })
    const shard = await new PackageShardLoader({
      baseUrl: 'https://cdn/x',
      fetchImpl: offline as never,
      store,
    }).load('geometry')
    expect(shard?.package).toBe('geometry')
    expect(offline).not.toHaveBeenCalled()
  })

  it('returns null for a missing shard without throwing', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }))
    const loader = new PackageShardLoader({
      baseUrl: 'https://cdn/x',
      fetchImpl: fetchImpl as never,
    })
    await expect(loader.load('nope')).resolves.toBeNull()
  })

  it('binds browser-style fetch implementations to the global object', async () => {
    const browserFetch = vi.fn(async function (this: unknown) {
      if (this !== globalThis) throw new TypeError('Illegal invocation')
      return shardResponse('browserpkg')
    })
    const loader = new PackageShardLoader({
      baseUrl: 'https://cdn/x',
      fetchImpl: browserFetch as typeof fetch,
    })

    await expect(loader.load('browserpkg')).resolves.toMatchObject({ package: 'browserpkg' })
    expect(browserFetch).toHaveBeenCalledTimes(1)
  })

  it('treats a valid-JSON but malformed shard as a failure (does not reject loadAll)', async () => {
    // A shard with no `commands` array used to throw inside registerShard and reject the
    // whole best-effort batch. It must resolve to null and leave the valid sibling intact.
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const name = String(url).match(/\/(\w+)\.json/)![1]!
      if (name === 'badshard') return new Response('{"package":"badshard"}', { status: 200 })
      if (name === 'arrshard') return new Response('[1,2,3]', { status: 200 })
      return shardResponse(name)
    })
    const loader = new PackageShardLoader({
      baseUrl: 'https://cdn/x',
      fetchImpl: fetchImpl as never,
    })
    await expect(loader.loadAll(['badshard', 'arrshard', 'goodshard'])).resolves.toBeUndefined()
    expect(getCommandPackage('goodshardcmd')).toBe('goodshard') // valid sibling still registered
    await expect(loader.load('badshard')).resolves.toBeNull()
    await expect(loader.load('arrshard')).resolves.toBeNull()
  })

  it('retries a transient load failure instead of caching the null forever', async () => {
    // A failed fetch must not be memoized as a permanent null — the next load() retries.
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient network error'))
      .mockResolvedValueOnce(shardResponse('booktabs'))
    const loader = new PackageShardLoader({
      baseUrl: 'https://cdn/x',
      fetchImpl: fetchImpl as never,
    })
    expect(await loader.load('booktabs')).toBeNull()
    expect((await loader.load('booktabs'))?.package).toBe('booktabs')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('keeps a valid network shard even when the cache write fails', async () => {
    const store: ShardStore = {
      async get() {
        return null
      },
      async set() {
        throw new Error('quota exceeded')
      },
    }
    const fetchImpl = vi.fn(async () => shardResponse('quotafail'))
    const loader = new PackageShardLoader({
      baseUrl: 'https://cdn/x',
      fetchImpl: fetchImpl as never,
      store,
    })
    const shard = await loader.load('quotafail')
    expect(shard?.package).toBe('quotafail')
    expect(getCommandPackage('quotafailcmd')).toBe('quotafail')
  })
})
