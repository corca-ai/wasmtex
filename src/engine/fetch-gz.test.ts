import { describe, expect, it } from 'vitest'
import { readResponseWithProgress } from './fetch-gz'

function response(chunks: number[][], headers?: HeadersInit) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk))
        controller.close()
      },
    }),
    headers ? { headers } : {},
  )
}

describe('response byte progress', () => {
  it('observes bytes without Content-Length and ignores empty chunks', async () => {
    const received: number[] = []
    const percentages: number[] = []
    const resp = response([[1, 2], [], [3]])
    const bytes = await readResponseWithProgress(
      resp,
      (value) => percentages.push(value),
      (value) => received.push(value),
    )
    expect([...bytes]).toEqual([1, 2, 3])
    expect(received).toEqual([2, 3])
    expect(percentages).toEqual([])
    expect(resp.body?.locked).toBe(false)
  })

  it('keeps actual decoded bytes even when HTTP length measures compressed bytes', async () => {
    const received: number[] = []
    const percentages: number[] = []
    await readResponseWithProgress(
      response(
        [
          [1, 2],
          [3, 4, 5],
        ],
        {
          'content-length': '3',
          'content-encoding': 'gzip',
        },
      ),
      (value) => percentages.push(value),
      (value) => received.push(value),
    )
    expect(received).toEqual([2, 5])
    expect(percentages).toEqual([67, 100])
  })

  it('releases a failed stream without presenting partial bytes as success', async () => {
    const failure = new Error('connection lost')
    let pulls = 0
    const received: number[] = []
    const resp = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          if (pulls++ === 0) controller.enqueue(new Uint8Array([1, 2]))
          else controller.error(failure)
        },
      }),
    )
    await expect(
      readResponseWithProgress(resp, undefined, (value) => received.push(value)),
    ).rejects.toBe(failure)
    expect(received).toEqual([2])
    expect(resp.body?.locked).toBe(false)
  })
})
