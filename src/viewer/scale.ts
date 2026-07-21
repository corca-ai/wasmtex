/** Zoom scale bounds for the PDF viewer, shared by absolute (`setScale`/`fitToWidth`) and
 *  relative (`zoom` +/-) zooming so the two can't disagree on the allowed range. */
export const MIN_SCALE = 0.25
export const MAX_SCALE = 5

/** Clamp a zoom scale into [{@link MIN_SCALE}, {@link MAX_SCALE}]. */
export function clampScale(scale: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale))
}

/** Rescale a within-page scroll offset when the zoom changes from `oldScale` to `newScale`,
 *  so the same fraction of the page stays under the viewport top (the page height scales with
 *  the zoom, so the additive in-page offset must scale too). Guards a zero/invalid old scale
 *  by leaving the offset unchanged. A no-op when the scale is unchanged (the recompile path). */
export function rescaleInPageOffset(offset: number, oldScale: number, newScale: number): number {
  return oldScale > 0 ? offset * (newScale / oldScale) : offset
}

/** Intrinsic page size cached at scale 1: width in px and the CSS `aspect-ratio` ("w / h"). */
export interface PageSize {
  width: number
  aspectRatio: string
}

/** Height (px) a page occupies at `scale`, from its intrinsic width and `aspect-ratio`
 *  ("w / h", as page-renderer sets it). 0 when the size/aspect-ratio is unusable. */
function pageHeightAtScale(size: PageSize, scale: number): number {
  const m = size.aspectRatio.match(/^\s*([\d.]+)\s*\/\s*([\d.]+)\s*$/)
  if (!m) return 0
  const w = Number.parseFloat(m[1]!)
  const h = Number.parseFloat(m[2]!)
  if (!(w > 0) || !(h > 0)) return 0
  return size.width * scale * (h / w)
}

/** The new-scale `offsetTop` of the visible page: the summed heights of the pages before it,
 *  computed from cached intrinsic sizes. Used instead of reading the live `offsetTop` during a
 *  zoom swap, when the preceding pages' DOM hasn't been rescaled yet (renderRemainingPages runs
 *  after the swap), which would otherwise leave the view jumped by the stale-scale delta. */
export function computeTargetOffsetTop(
  pageSizes: Array<PageSize | undefined>,
  visiblePage: number,
  scale: number,
): number {
  let top = 0
  for (let i = 0; i < visiblePage - 1; i++) {
    const size = pageSizes[i]
    if (size) top += pageHeightAtScale(size, scale)
  }
  return top
}

/** Compute the scroll position to restore after a page-DOM swap, keeping the viewed page's
 *  in-page offset (rescaled for any zoom). When the previously-viewed page no longer exists in
 *  the new document — `anchorToTop` (the recompile clamped `currentPage` to 1 because the doc
 *  shrank) or no old wrapper was found (`oldPageOffsetTop == null`) — the captured offset refers
 *  to a different page, so it is discarded and the new target page is anchored at its top. */
export function computeRestoredScrollTop(args: {
  scrollTop: number
  oldPageOffsetTop: number | null
  newTargetOffsetTop: number
  oldScale: number
  newScale: number
  anchorToTop: boolean
}): number {
  const { scrollTop, oldPageOffsetTop, newTargetOffsetTop, oldScale, newScale, anchorToTop } = args
  if (anchorToTop || oldPageOffsetTop === null) return newTargetOffsetTop
  return newTargetOffsetTop + rescaleInPageOffset(scrollTop - oldPageOffsetTop, oldScale, newScale)
}
