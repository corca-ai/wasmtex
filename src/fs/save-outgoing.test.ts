import { describe, expect, it } from 'vitest'
import { saveOutgoingFile } from './save-outgoing'
import { VirtualFS } from './virtual-fs'

describe('saveOutgoingFile', () => {
  it('does not resurrect a file deleted out from under the editor', () => {
    // Deleting the currently-open file then switching to mainFile used to save the
    // outgoing (deleted) path back into the VFS — re-creating it with the editor's stale
    // content, so the delete silently did not take effect. The save must no-op.
    const fs = new VirtualFS({ empty: true })
    fs.writeFile('extra.tex', 'hello')
    fs.deleteFile('extra.tex')
    const wrote = saveOutgoingFile(fs, 'extra.tex', 'stale editor content')
    expect(wrote).toBe(false)
    expect(fs.getFile('extra.tex')).toBeUndefined()
  })

  it('saves the outgoing buffer when the file still exists', () => {
    const fs = new VirtualFS({ empty: true })
    fs.writeFile('a.tex', 'old')
    const wrote = saveOutgoingFile(fs, 'a.tex', 'new')
    expect(wrote).toBe(true)
    expect(fs.getFile('a.tex')?.content).toBe('new')
  })
})
