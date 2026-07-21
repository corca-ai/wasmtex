export interface SourceLocation {
  file: string
  line: number
  column: number
}

export interface LabelDef {
  name: string
  location: SourceLocation
}

export interface LabelRef {
  name: string
  location: SourceLocation
}

export interface CitationRef {
  key: string
  location: SourceLocation
}

export type SectionLevel =
  | 'part'
  | 'chapter'
  | 'section'
  | 'subsection'
  | 'subsubsection'
  | 'paragraph'

export interface SectionDef {
  level: SectionLevel
  title: string
  location: SourceLocation
}

export interface CommandDef {
  name: string
  location: SourceLocation
  argCount?: number
}

/** A `\command` token occurrence in the source (a call site, or the name in its own
 *  definition). Drives find-references / rename for user-defined commands. */
export interface CommandUse {
  name: string
  location: SourceLocation
}

export interface EnvironmentUse {
  name: string
  location: SourceLocation
}

export interface IncludeDef {
  path: string
  location: SourceLocation
  type: 'input' | 'include' | 'subfile'
}

export interface PackageRef {
  name: string
  options: string
  location: SourceLocation
}

export interface FileSymbols {
  labels: LabelDef[]
  labelRefs: LabelRef[]
  citations: CitationRef[]
  sections: SectionDef[]
  commands: CommandDef[]
  commandUses: CommandUse[]
  environments: EnvironmentUse[]
  environmentDefs: EnvironmentUse[] // Reuse EnvironmentUse for definitions
  includes: IncludeDef[]
  packages: PackageRef[]
  bibItems: BibitemDef[]
}

export interface AuxData {
  labels: Map<string, string>
  citations: Set<string>
  includes: string[]
}

export interface BibitemDef {
  key: string
  location: SourceLocation
}

export interface BibEntry {
  key: string
  type: string
  location: SourceLocation
  title?: string
  author?: string
  year?: string
  /** Publication venue: journal, booktitle, or publisher (whichever is present). */
  journal?: string
  /** All parsed fields (lowercased names → cleaned values). */
  fields?: Record<string, string>
}
