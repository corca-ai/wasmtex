import { describe, expect, it } from 'vitest'
import { BinaryPreviewController, type PreviewOverlayElement } from './binary-preview'

function stubElement(display = 'none'): PreviewOverlayElement {
  return { style: { display }, innerHTML: '' }
}

describe('BinaryPreviewController', () => {
  it('toggles visibility via show()/hide() and clears content on hide', () => {
    const el = stubElement('none')
    const preview = new BinaryPreviewController(el)
    expect(preview.isVisible()).toBe(false)

    preview.show()
    expect(preview.isVisible()).toBe(true)
    expect(el.style.display).toBe('flex')

    el.innerHTML = '<img>'
    preview.hide()
    expect(preview.isVisible()).toBe(false)
    expect(el.style.display).toBe('none')
    expect(el.innerHTML).toBe('') // overlay content dropped so it can't linger
  })

  it('suppresses a model-change only while the overlay is up for the current file', () => {
    const preview = new BinaryPreviewController(stubElement('none'))
    // Hidden overlay never suppresses.
    expect(preview.shouldSuppressModelChange('main.tex', 'main.tex')).toBe(false)

    preview.show()
    expect(preview.shouldSuppressModelChange('main.tex', 'main.tex')).toBe(true)
    // A change to a different file is not suppressed even with the overlay up.
    expect(preview.shouldSuppressModelChange('other.tex', 'main.tex')).toBe(false)
  })

  it('switching to a text file (loadProject/onFileSelect) hides the overlay and unblocks edits', () => {
    // Regression: loadProject switched the editor to the main file but never hid a binary
    // overlay left up from a previous preview. The stale overlay then made
    // shouldSuppressModelChange return true and silently drop every edit to main.tex. The
    // switch flow must hide() the overlay so subsequent edits are processed.
    const preview = new BinaryPreviewController(stubElement('flex')) // a logo.png was being previewed
    expect(preview.shouldSuppressModelChange('main.tex', 'main.tex')).toBe(true)

    preview.hide() // what loadProject (and onFileSelect's text path) must do

    expect(preview.isVisible()).toBe(false)
    expect(preview.shouldSuppressModelChange('main.tex', 'main.tex')).toBe(false)
  })
})
