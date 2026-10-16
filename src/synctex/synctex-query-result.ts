import type { SynctexData, SynctexNode } from './synctex-parser'
import type { PdfLocation, SourceLocation } from './text-mapper'

export interface SynctexSourceLocation extends SourceLocation {
  /** Present only when the engine recorded a positive source column. */
  column?: number
}

export interface SynctexLookupOptions {
  /** A pure host predicate; rejected locations are never returned. */
  acceptSource?: (source: Readonly<SynctexSourceLocation>) => boolean
}

export interface SynctexInverseMatch {
  source: SynctexSourceLocation
  /** Selected node geometry, not a glyph ink rectangle. */
  region: PdfLocation
  /** Box used for the local bracket/container search, otherwise null. */
  container: PdfLocation | null
  nodeType: SynctexNode['type']
  method: 'bracket' | 'container' | 'nearest-child' | 'nearest-node'
  /** Geometric L1 distance to region in scale-one PDF points; not a probability. */
  distance: number
  match: 'contains' | 'nearby'
}

export interface SynctexForwardMatch {
  source: SourceLocation
  requestedLine: number
  match: 'exact' | 'nearby'
  /** Disjoint regions on the same selected page as forwardLookupAll. */
  regions: PdfLocation[]
}

export function synctexSourceLocation(data: SynctexData, node: SynctexNode): SynctexSourceLocation {
  return {
    file: data.inputs.get(node.input) ?? '',
    line: node.line,
    ...(node.column > 0 ? { column: node.column } : {}),
  }
}

function nodeRegion(node: SynctexNode): PdfLocation {
  const box = ['hbox', 'vbox', 'void_hbox', 'void_vbox'].includes(node.type)
  // A kern is recorded after its signed move. Other leaves are vertical
  // markers in their parent's height band; parentless leaves remain points.
  const otherX = box ? node.h + node.width : node.type === 'kern' ? node.h - node.width : node.h
  const top = node.v - (box ? node.height : (node.parent?.height ?? 0))
  const bottom = node.v + (box ? node.depth : 0)
  return {
    page: node.page,
    x: Math.min(node.h, otherX),
    y: Math.min(top, bottom),
    width: Math.abs(otherX - node.h),
    height: Math.abs(bottom - top),
  }
}

export function describeSynctexInverseMatch(
  data: SynctexData,
  node: SynctexNode,
  x: number,
  y: number,
  method: SynctexInverseMatch['method'],
  container: SynctexNode | null = null,
): SynctexInverseMatch {
  // The reference descent may end at a leaf. Keep its source selection, but
  // expose the enclosing box rather than pretending the marker is a container.
  while (container && !['hbox', 'vbox', 'void_hbox', 'void_vbox'].includes(container.type)) {
    container = container.parent
  }
  const region = nodeRegion(node)
  const distance =
    Math.max(region.x - x, x - region.x - region.width, 0) +
    Math.max(region.y - y, y - region.y - region.height, 0)
  return {
    source: synctexSourceLocation(data, node),
    region,
    container: container ? nodeRegion(container) : null,
    nodeType: node.type,
    method,
    distance,
    match: distance === 0 ? 'contains' : 'nearby',
  }
}
