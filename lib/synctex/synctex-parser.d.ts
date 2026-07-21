import { PdfLocation, SourceLocation } from './text-mapper';
/**
 * SyncTeX file parser for PDF↔source bidirectional navigation.
 *
 * Ported from the reference C implementation (synctex_parser.c by Jérôme Laurens).
 * Original reference implementation copyright (c) 2008-2017 Jérôme Laurens.
 * The complete upstream permission and non-endorsement notice is retained in
 * LICENSES/SyncTeX.txt and distributed with this package.
 * Tree-based parser preserving parent-child box hierarchy.
 *
 * Key algorithms from reference:
 * - Inverse search: deepest container → L/R bracketing of closest children
 * - Forward search: friend index → non-box first → nearest-line zigzag
 * - Distance: L1 (Manhattan) not Euclidean
 *
 * Coordinate system: SyncTeX stores positions in TeX scaled points (sp).
 * We convert to PDF points (bp, 1/72 inch) for use with PDF.js viewports.
 *   pdf_pt = sp * unit * magnification / 1000 / 65536 * 72 / 72.27
 */
export type { PdfLocation, SourceLocation } from './text-mapper';
export interface SynctexNode {
    type: 'hbox' | 'vbox' | 'kern' | 'glue' | 'math' | 'void_vbox' | 'void_hbox';
    input: number;
    line: number;
    column: number;
    page: number;
    /** Horizontal position in PDF points from left edge */
    h: number;
    /** Vertical position in PDF points from top edge (downward positive) */
    v: number;
    /** Width in PDF points */
    width: number;
    /** Height in PDF points (above baseline) */
    height: number;
    /** Depth in PDF points (below baseline) */
    depth: number;
    /** Parent box in the SyncTeX tree (null for page-level root nodes) */
    parent: SynctexNode | null;
    /** Child nodes within this box (empty for leaf nodes) */
    children: SynctexNode[];
}
export interface SynctexData {
    inputs: Map<number, string>;
    /** Flat list of all nodes per page (backward compatibility) */
    pages: Map<number, SynctexNode[]>;
    /** Tree roots per page — top-level boxes from which children descend */
    pageRoots?: Map<number, SynctexNode[]>;
    /** Friend index: "inputTag:line" → nodes, for O(1) forward lookup */
    friendIndex?: Map<string, SynctexNode[]>;
    magnification: number;
    unit: number;
    xOffset: number;
    yOffset: number;
}
/**
 * Normalize a SyncTeX `Input:` path: strip the WASM working-dir prefix (`/work/./`,
 * `/work/`, or a leading `./`) and collapse interior `/./` segments — WITHOUT dropping
 * parent directories. A subdirectory path like `chapters/./intro.tex` must keep
 * `chapters/` (the old `indexOf('/./')` slice discarded it, breaking forward/inverse
 * search for any file in a subdirectory).
 */
export declare function normalizeSynctexInputName(name: string): string;
export declare class SynctexParser {
    /**
     * Parse raw synctex data (possibly gzip-compressed) into structured data.
     */
    parse(data: Uint8Array): Promise<SynctexData>;
    /**
     * Parse synctex text content into a tree-structured representation.
     * Uses a stack to track open vbox/hbox containers, building parent-child
     * relationships and a friend index for O(1) forward lookup.
     */
    parseText(text: string): SynctexData;
    /**
     * Inverse search: PDF click → source location.
     * Port of synctex_iterator_new_edit from reference.
     *
     * Algorithm:
     * 1. Scan all hboxes on the page, find smallest containing one
     * 2. Drill into deepest container (DFS)
     * 3. Find L/R closest children using horizontal ordered distance
     * 4. Pick the best based on line number and distance
     * 5. Fallback: closest deep child using L1 distance
     */
    inverseLookup(data: SynctexData, page: number, x: number, y: number): SourceLocation | null;
    /**
     * Forward search: source line → PDF region.
     * Port of synctex_iterator_new_display from reference.
     *
     * Algorithm:
     * 1. Find input tag for the file
     * 2. Try exact line match via friend index
     * 3. If no match, zigzag to nearby lines: line±1, ±2, ... up to 100 tries
     * 4. For each line: non-box nodes first (reference: exclude_box=YES),
     *    then include boxes as fallback
     */
    forwardLookup(data: SynctexData, file: string, line: number): PdfLocation | null;
    /** Forward search for a specific line. Two-pass: non-box first, then all. */
    private forwardForLine;
    /** Compute forward search result from matched nodes */
    private forwardFromNodes;
    /** Point-in-box test (reference: _synctex_point_in_box_v2) */
    private pointInBox;
    /** Vertical ordered distance (reference: _synctex_point_v_ordered_distance_v2) */
    private vOrderedDistance;
    /** Smallest container by area (reference: _synctex_smallest_container_v2) */
    private smallestContainer;
    /**
     * Deepest container: DFS to find the deepest box containing the hit point.
     * Reference: _synctex_eq_deepest_container_v2
     */
    private deepestContainer;
    /**
     * Find L/R closest children within a box using horizontal ordered distance.
     * Reference: __synctex_eq_get_closest_children_in_hbox_v2
     */
    private getClosestChildrenInBox;
    /**
     * Pick the best of L/R results.
     * Reference: synctex_iterator_new_edit lines 7338-7377
     */
    private pickBestLR;
    /**
     * Recursive closest deep child by L1 distance.
     * Reference: __synctex_closest_deep_child_v2
     */
    private closestDeepChild;
    /** Walk up from a leaf to find the nearest ancestor hbox */
    private findAncestorHbox;
    /** Compute a bounding box enclosing the given nodes */
    private bboxFromNodes;
}
