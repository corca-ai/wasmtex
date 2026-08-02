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

export interface ClassRef {
  name: string
  options: string
  location: SourceLocation
}

export interface ColorDefinition {
  name: string
  kind: 'define' | 'provide' | 'alias'
  model?: string
  value?: string
  alias?: string
  location: SourceLocation
  provenance?: 'project' | 'runtime-observed'
}

export interface ColorActivation {
  names: string[]
  kind: 'define' | 'provide'
  location: SourceLocation
}

export type ProjectValueRole = 'definition' | 'usage' | 'alias' | 'runtime-observed'

/** A statically recoverable named value contributed by project source. */
export interface ProjectValue {
  name: string
  role: ProjectValueRole
  location: SourceLocation
  /** Optional declaration target, for example the font behind a command alias. */
  target?: string
}

export type ProjectKeyValueType =
  | 'flag'
  | 'boolean'
  | 'enum'
  | 'number'
  | 'dimension'
  | 'color'
  | 'file'
  | 'command'
  | 'free-text'

/** A key declared in the project through xkeyval, pgfkeys, or LaTeX3 keys. */
export interface ProjectKeyDefinition {
  family: string
  name: string
  valueType: ProjectKeyValueType
  values?: string[]
  location: SourceLocation
  provenance?: 'project' | 'runtime-observed'
}

export interface BibliographyRef {
  path: string
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
  classes: ClassRef[]
  packages: PackageRef[]
  colors: ColorDefinition[]
  colorActivations: ColorActivation[]
  counters: ProjectValue[]
  lengths: ProjectValue[]
  glossaryEntries: ProjectValue[]
  acronymEntries: ProjectValue[]
  fontFamilies: ProjectValue[]
  keys: ProjectKeyDefinition[]
  bibliographies: BibliographyRef[]
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

export interface BibStringDef {
  name: string
  value: string
  location: SourceLocation
}

export interface ParsedBibFile {
  entries: BibEntry[]
  strings: BibStringDef[]
}
