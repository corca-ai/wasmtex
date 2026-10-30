import { describe, expect, it, vi } from 'vitest'
import { SynctexParser } from './synctex-parser'

const preamble =
  'SyncTeX Version:1\nInput:1:/work/./main.tex\nMagnification:1000\nUnit:1\nContent:\n'
const page = (number: number) =>
  `{${number}\n[1,1:0,0:34611850,49825690,0\n(1,3:4736286,3670016:25137278,655360,0\nh1,3:4736286,3670016:3078103,655360,0\n)\n]\n}${number}\n`
const large =
  preamble + Array.from({ length: 3000 }, (_, at) => page(at + 1)).join('') + 'Postamble:\n'
const bytes = (source: string) => new TextEncoder().encode(source)

describe('cooperative SyncTeX parsing', () => {
  it('finishes small outputs before an unrelated task and preserves unterminated input', async () => {
    const parser = new SynctexParser()
    let otherTask = false
    const timer = setTimeout(() => {
      otherTask = true
    }, 0)
    try {
      const source = (preamble + page(1) + 'Postamble:').replaceAll('\n', '\r\n')
      const parsed = await parser.parse(bytes(source))
      expect(otherTask).toBe(false)
      expect(parsed).toEqual(parser.parseText(source))
    } finally {
      clearTimeout(timer)
    }
  })

  it('lets another task run before large output completes without changing lookup evidence', async () => {
    const parser = new SynctexParser()
    let clock = 0
    const timing = vi.spyOn(performance, 'now').mockImplementation(() => ++clock)
    let otherTask = false
    const timer = setTimeout(() => {
      otherTask = true
    }, 0)
    try {
      const parsed = await parser.parse(bytes(large))
      expect(otherTask).toBe(true)
      const expected = parser.parseText(large)
      expect([...parsed.inputs]).toEqual([...expected.inputs])
      expect(parsed.pages.size).toBe(3000)
      expect(parser.forwardLookupDetailed(parsed, 'main.tex', 3)).toEqual(
        parser.forwardLookupDetailed(expected, 'main.tex', 3),
      )
      expect(parser.inverseLookupDetailed(parsed, 1578, 74, 56)).toEqual(
        parser.inverseLookupDetailed(expected, 1578, 74, 56),
      )
      const node = parsed.pageRoots?.get(1578)?.[0]
      expect(node).toBeDefined()
      expect(node?.children[0]?.parent).toBe(node)
    } finally {
      clearTimeout(timer)
      timing.mockRestore()
    }
  })

  it('stops retired large work after yielding and refuses an already aborted small job', async () => {
    const parser = new SynctexParser()
    let clock = 0
    const timing = vi.spyOn(performance, 'now').mockImplementation(() => ++clock)
    const controller = new AbortController()
    const reason = new Error('superseded revision')
    const timer = setTimeout(() => controller.abort(reason), 0)
    try {
      await expect(parser.parse(bytes(large), { signal: controller.signal })).rejects.toBe(reason)
      await expect(
        parser.parse(bytes(preamble + page(1)), { signal: controller.signal }),
      ).rejects.toBe(reason)
    } finally {
      clearTimeout(timer)
      timing.mockRestore()
    }
  })
})
