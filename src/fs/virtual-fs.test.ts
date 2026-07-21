import { describe, expect, it, vi } from 'vitest'
import { VirtualFS } from './virtual-fs'

describe('VirtualFS', () => {
  it('initializes with main.tex', () => {
    const fs = new VirtualFS()
    expect(fs.listFiles()).toContain('main.tex')
    expect(fs.readFile('main.tex')).toBeTypeOf('string')
  })

  it('writes and reads a file', () => {
    const fs = new VirtualFS()
    fs.writeFile('test.tex', 'hello')
    expect(fs.readFile('test.tex')).toBe('hello')
  })

  it('writes and reads binary content', () => {
    const fs = new VirtualFS()
    const data = new Uint8Array([1, 2, 3])
    fs.writeFile('image.png', data)
    expect(fs.readFile('image.png')).toEqual(data)
  })

  it('returns null for non-existent file', () => {
    const fs = new VirtualFS()
    expect(fs.readFile('nope.tex')).toBeNull()
  })

  it('deletes a file', () => {
    const fs = new VirtualFS()
    fs.writeFile('tmp.tex', 'x')
    expect(fs.deleteFile('tmp.tex')).toBe(true)
    expect(fs.readFile('tmp.tex')).toBeNull()
  })

  it('returns false when deleting non-existent file', () => {
    const fs = new VirtualFS()
    expect(fs.deleteFile('nope.tex')).toBe(false)
  })

  it('lists files sorted', () => {
    const fs = new VirtualFS()
    fs.writeFile('b.tex', '')
    fs.writeFile('a.tex', '')
    const files = fs.listFiles()
    expect(files).toEqual([
      'a.tex',
      'algebra.tex',
      'analysis.tex',
      'b.tex',
      'linalg.tex',
      'main.tex',
      'refs.bib',
    ])
  })

  it('tracks modified files', () => {
    const fs = new VirtualFS()
    // default files start modified (main.tex + 3 chapter files + refs.bib)
    expect(fs.getModifiedFiles()).toHaveLength(5)

    fs.markSynced()
    expect(fs.getModifiedFiles()).toHaveLength(0)

    fs.writeFile('new.tex', 'content')
    expect(fs.getModifiedFiles()).toHaveLength(1)
    expect(fs.getModifiedFiles()[0]!.path).toBe('new.tex')
  })

  it('marks all files as synced', () => {
    const fs = new VirtualFS()
    fs.writeFile('a.tex', 'x')
    fs.writeFile('b.tex', 'y')
    fs.markSynced()
    expect(fs.getModifiedFiles()).toHaveLength(0)
  })

  it('marks all files modified again (e.g. after an engine cache flush)', () => {
    const fs = new VirtualFS({ empty: true })
    fs.writeFile('a.tex', 'x')
    fs.writeFile('b.tex', 'y')
    fs.markSynced()
    expect(fs.getModifiedFiles()).toHaveLength(0)

    fs.markAllModified()
    expect(
      fs
        .getModifiedFiles()
        .map((f) => f.path)
        .sort(),
    ).toEqual(['a.tex', 'b.tex'])
  })

  it('does not lose an edit that arrives between capture and markSynced', () => {
    const fs = new VirtualFS({ empty: true })
    fs.writeFile('f.tex', 'A')
    fs.markSynced() // baseline clean

    fs.writeFile('f.tex', 'A2') // pending edit
    const captured = fs.getModifiedFiles() // what syncAndCompile writes to the engine
    expect(captured.map((file) => file.content)).toEqual(['A2'])

    // A NEW edit arrives mid-await (engine.writeFile yields the event loop),
    // replacing the map entry before markSynced() runs.
    fs.writeFile('f.tex', 'B')

    // Only the captured files were actually synced to the engine.
    fs.markSynced(captured)

    expect(fs.readFile('f.tex')).toBe('B')
    // 'B' was never sent to the engine, so it must remain pending for the next cycle.
    expect(fs.getModifiedFiles().map((file) => file.content)).toEqual(['B'])
  })

  it('notifies listeners on write', () => {
    const fs = new VirtualFS()
    const listener = vi.fn()
    fs.onChange(listener)
    listener.mockClear() // clear call from constructor's writeFile

    fs.writeFile('test.tex', 'hello')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('notifies listeners on delete', () => {
    const fs = new VirtualFS()
    fs.writeFile('test.tex', 'hello')
    const listener = vi.fn()
    fs.onChange(listener)

    fs.deleteFile('test.tex')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('unsubscribes listener', () => {
    const fs = new VirtualFS()
    const listener = vi.fn()
    const unsub = fs.onChange(listener)
    listener.mockClear()

    unsub()
    fs.writeFile('test.tex', 'x')
    expect(listener).not.toHaveBeenCalled()
  })

  it('does not invoke a listener that unsubscribed itself during a notify cycle', () => {
    const fs = new VirtualFS({ empty: true })
    const b = vi.fn()
    let unsubB: () => void = () => {}
    const a = vi.fn(() => unsubB()) // A unsubscribes B mid-notify
    fs.onChange(a)
    unsubB = fs.onChange(b)
    a.mockClear()
    b.mockClear()

    fs.writeFile('x.tex', '1') // triggers notify(); A runs, unsubscribes B
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).not.toHaveBeenCalled()
  })

  it('unsubscribing one of two identical registrations removes only that one', () => {
    // Subscribing the same fn twice must fire it twice; each unsubscriber removes exactly
    // ONE registration. The old filter(!==) wiped BOTH copies, so un1() silenced un2() too.
    const fs = new VirtualFS({ empty: true })
    const fn = vi.fn()
    const un1 = fs.onChange(fn)
    fs.onChange(fn) // second, independent registration of the same reference
    fs.writeFile('a.tex', '1')
    expect(fn).toHaveBeenCalledTimes(2)
    fn.mockClear()
    un1() // removes only the first registration; the second must survive
    fs.writeFile('b.tex', '2')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('self-unsubscribing listener is not re-called and is gone next cycle', () => {
    const fs = new VirtualFS({ empty: true })
    let unsubA: () => void = () => {}
    const a = vi.fn(() => unsubA())
    unsubA = fs.onChange(a)
    a.mockClear()
    fs.writeFile('a.tex', '1') // A fires once, removes itself
    fs.writeFile('b.tex', '2') // A must NOT fire again
    expect(a).toHaveBeenCalledTimes(1)
  })

  it('getFile returns VirtualFile or undefined', () => {
    const fs = new VirtualFS()
    const file = fs.getFile('main.tex')
    expect(file).toBeDefined()
    expect(file!.path).toBe('main.tex')
    expect(file!.content).toBeTypeOf('string')

    expect(fs.getFile('nope.tex')).toBeUndefined()
  })

  it('overwrites existing file', () => {
    const fs = new VirtualFS()
    fs.writeFile('test.tex', 'first')
    fs.writeFile('test.tex', 'second')
    expect(fs.readFile('test.tex')).toBe('second')
    expect(fs.listFiles().filter((f) => f === 'test.tex')).toHaveLength(1)
  })
})
