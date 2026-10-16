import { SynctexData, SynctexNode } from './synctex-parser.js';
import { PdfLocation, SourceLocation } from './text-mapper.js';
export interface SynctexSourceLocation extends SourceLocation {
    /** Present only when the engine recorded a positive source column. */
    column?: number;
}
export interface SynctexLookupOptions {
    /** A pure host predicate; rejected locations are never returned. */
    acceptSource?: (source: Readonly<SynctexSourceLocation>) => boolean;
}
export interface SynctexInverseMatch {
    source: SynctexSourceLocation;
    /** Selected node geometry, not a glyph ink rectangle. */
    region: PdfLocation;
    /** Box used for the local bracket/container search, otherwise null. */
    container: PdfLocation | null;
    nodeType: SynctexNode['type'];
    method: 'bracket' | 'container' | 'nearest-child' | 'nearest-node';
    /** Geometric L1 distance to region in scale-one PDF points; not a probability. */
    distance: number;
    match: 'contains' | 'nearby';
}
export interface SynctexForwardMatch {
    source: SourceLocation;
    requestedLine: number;
    match: 'exact' | 'nearby';
    /** Disjoint regions on the same selected page as forwardLookupAll. */
    regions: PdfLocation[];
}
export declare function synctexSourceLocation(data: SynctexData, node: SynctexNode): SynctexSourceLocation;
export declare function describeSynctexInverseMatch(data: SynctexData, node: SynctexNode, x: number, y: number, method: SynctexInverseMatch['method'], container?: SynctexNode | null): SynctexInverseMatch;
