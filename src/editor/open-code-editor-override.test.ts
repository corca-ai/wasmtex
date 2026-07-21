import { describe, expect, it, vi } from 'vitest'
import {
  installOpenCodeEditorOverride,
  type OpenCodeEditorService,
} from './open-code-editor-override'

describe('installOpenCodeEditorOverride', () => {
  it('replaces openCodeEditor and restores the exact original on dispose', () => {
    const original = vi.fn(() => 'original-result')
    const service: OpenCodeEditorService = { openCodeEditor: original }

    const handle = installOpenCodeEditorOverride(service, (_i, _s, _b, orig) => orig(_i, _s, _b))
    expect(service.openCodeEditor).not.toBe(original) // patched

    handle.dispose()
    expect(service.openCodeEditor).toBe(original) // exact identity restored (no leak)
  })

  it('passes the bound original through to the handler for fallback', async () => {
    const original = vi.fn(async () => null)
    const service: OpenCodeEditorService = { openCodeEditor: original }
    const handler = vi.fn(async (input, _s, _b, orig) => {
      const fallback = await orig(input, _s, _b)
      return fallback ?? `handled:${input}`
    })

    installOpenCodeEditorOverride(service, handler)
    const result = await service.openCodeEditor('doc.tex', undefined, undefined)

    expect(original).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(result).toBe('handled:doc.tex') // original returned null → handler's fallback used
  })

  it('does not clobber a later consumer that replaced our patch', () => {
    const original = vi.fn()
    const service: OpenCodeEditorService = { openCodeEditor: original }
    const handle = installOpenCodeEditorOverride(service, (_i, _s, _b, orig) => orig(_i, _s, _b))

    const newerOverride = vi.fn()
    service.openCodeEditor = newerOverride // a second consumer overrides afterwards

    handle.dispose()
    expect(service.openCodeEditor).toBe(newerOverride) // ours is gone, theirs survives
  })
})
