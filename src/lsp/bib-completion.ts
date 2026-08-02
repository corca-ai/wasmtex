import type { BibCompletionContext } from './bib-completion-context'
import type {
  CompletionResolverEnvironment,
  CompletionResolverRegistry,
} from './completion-registry'
import type { NeutralCompletionItem } from './protocol'

const ENTRY_TYPES = [
  'article',
  'book',
  'mvbook',
  'inbook',
  'bookinbook',
  'suppbook',
  'booklet',
  'collection',
  'mvcollection',
  'incollection',
  'suppcollection',
  'manual',
  'misc',
  'online',
  'patent',
  'periodical',
  'suppperiodical',
  'proceedings',
  'mvproceedings',
  'inproceedings',
  'reference',
  'mvreference',
  'inreference',
  'report',
  'set',
  'thesis',
  'unpublished',
  'xdata',
  'conference',
  'electronic',
  'mastersthesis',
  'phdthesis',
  'techreport',
  'www',
] as const

const COMMON_FIELDS = [
  'author',
  'editor',
  'editora',
  'editorb',
  'editorc',
  'translator',
  'annotator',
  'commentator',
  'introduction',
  'foreword',
  'afterword',
  'holder',
  'title',
  'subtitle',
  'titleaddon',
  'maintitle',
  'mainsubtitle',
  'maintitleaddon',
  'booktitle',
  'booksubtitle',
  'booktitleaddon',
  'journaltitle',
  'journalsubtitle',
  'journal',
  'date',
  'year',
  'month',
  'day',
  'eventdate',
  'origdate',
  'urldate',
  'volume',
  'volumes',
  'number',
  'issue',
  'edition',
  'version',
  'series',
  'chapter',
  'pages',
  'pagetotal',
  'pagination',
  'publisher',
  'institution',
  'organization',
  'location',
  'venue',
  'type',
  'howpublished',
  'note',
  'addendum',
  'doi',
  'eprint',
  'eprinttype',
  'eprintclass',
  'url',
  'isbn',
  'issn',
  'isrn',
  'ismn',
  'iswc',
  'language',
  'langid',
  'keywords',
  'abstract',
  'annotation',
  'crossref',
  'xref',
  'xdata',
  'related',
  'relatedtype',
  'options',
  'shorthand',
  'sortkey',
  'sortname',
  'sorttitle',
  'sortyear',
] as const

const TYPE_FIELDS: Readonly<Record<string, readonly string[]>> = {
  article: [
    'author',
    'title',
    'journaltitle',
    'journal',
    'date',
    'year',
    'volume',
    'number',
    'pages',
  ],
  book: ['author', 'editor', 'title', 'publisher', 'location', 'date', 'year', 'edition', 'volume'],
  mvbook: ['author', 'editor', 'title', 'publisher', 'location', 'date', 'year', 'volumes'],
  inbook: [
    'author',
    'title',
    'booktitle',
    'editor',
    'publisher',
    'location',
    'date',
    'year',
    'chapter',
    'pages',
  ],
  bookinbook: ['author', 'title', 'booktitle', 'editor', 'publisher', 'date', 'year', 'pages'],
  collection: ['editor', 'title', 'publisher', 'location', 'date', 'year', 'edition'],
  mvcollection: ['editor', 'title', 'publisher', 'location', 'date', 'year', 'volumes'],
  incollection: [
    'author',
    'title',
    'booktitle',
    'editor',
    'publisher',
    'location',
    'date',
    'year',
    'pages',
  ],
  proceedings: ['editor', 'title', 'publisher', 'location', 'venue', 'eventdate', 'date', 'year'],
  mvproceedings: [
    'editor',
    'title',
    'publisher',
    'location',
    'eventdate',
    'date',
    'year',
    'volumes',
  ],
  inproceedings: [
    'author',
    'title',
    'booktitle',
    'editor',
    'venue',
    'eventdate',
    'date',
    'year',
    'pages',
  ],
  conference: ['author', 'title', 'booktitle', 'editor', 'venue', 'date', 'year', 'pages'],
  thesis: ['author', 'title', 'type', 'institution', 'location', 'date', 'year'],
  mastersthesis: ['author', 'title', 'school', 'institution', 'address', 'date', 'year'],
  phdthesis: ['author', 'title', 'school', 'institution', 'address', 'date', 'year'],
  report: ['author', 'title', 'type', 'institution', 'number', 'location', 'date', 'year'],
  techreport: ['author', 'title', 'institution', 'type', 'number', 'address', 'date', 'year'],
  manual: ['author', 'editor', 'title', 'organization', 'location', 'edition', 'date', 'year'],
  online: ['author', 'editor', 'title', 'date', 'year', 'url', 'urldate'],
  electronic: ['author', 'title', 'date', 'year', 'url', 'urldate'],
  www: ['author', 'title', 'date', 'year', 'url', 'urldate'],
  patent: ['author', 'holder', 'title', 'type', 'number', 'location', 'date', 'year'],
  periodical: ['editor', 'title', 'issuetitle', 'volume', 'number', 'date', 'year'],
  unpublished: ['author', 'title', 'date', 'year', 'howpublished', 'note'],
  misc: ['author', 'editor', 'title', 'date', 'year', 'howpublished'],
  xdata: [],
}

const MONTH_STRINGS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const

function entryTypeItems(context: BibCompletionContext): NeutralCompletionItem[] {
  return ENTRY_TYPES.filter((type) => type.startsWith(context.prefix.toLowerCase())).map(
    (type) => ({
      label: type,
      kind: 'module',
      insertText: type,
      detail: 'BibTeX/biblatex entry type',
      sortText: `0_${type}`,
      replaceLength: context.prefix.length,
    }),
  )
}

function fieldItems(context: BibCompletionContext): NeutralCompletionItem[] {
  const preferred = TYPE_FIELDS[context.entryType ?? ''] ?? []
  const names = [...new Set([...preferred, ...COMMON_FIELDS])]
  const used = new Set(context.usedFields)
  return names
    .filter((field) => field.startsWith(context.prefix) && !used.has(field))
    .map((field) => {
      const rank = preferred.indexOf(field)
      return {
        label: field,
        kind: 'variable' as const,
        insertText: field,
        detail: rank >= 0 ? `Common for @${context.entryType}` : 'BibTeX/biblatex field',
        sortText: `${rank >= 0 ? `0_${String(rank).padStart(3, '0')}` : '1'}_${field}`,
        replaceLength: context.prefix.length,
      }
    })
}

function entryKeyItems(
  context: BibCompletionContext,
  environment: CompletionResolverEnvironment,
): NeutralCompletionItem[] {
  return environment.index
    .getBibEntries(environment.document.path)
    .filter((entry) => entry.key.startsWith(context.prefix))
    .map((entry) => ({
      label: entry.key,
      kind: 'reference',
      insertText: entry.key,
      detail: `@${entry.type} · ${entry.location.file}:${entry.location.line}`,
      documentation: [entry.author, entry.title, entry.year].filter(Boolean).join(' · '),
      replaceLength: context.prefix.length,
    }))
}

function stringItems(
  context: BibCompletionContext,
  environment: CompletionResolverEnvironment,
): NeutralCompletionItem[] {
  const project = new Map(
    environment.index
      .getBibStrings(environment.document.path)
      .map((definition) => [definition.name, definition] as const),
  )
  const names = new Set([...MONTH_STRINGS, ...project.keys()])
  return [...names]
    .filter((name) => name.startsWith(context.prefix.toLowerCase()))
    .sort()
    .map((name) => {
      const definition = project.get(name)
      return {
        label: name,
        kind: 'variable',
        insertText: name,
        detail: definition
          ? `@string · ${definition.location.file}:${definition.location.line}`
          : 'BibTeX month string',
        ...(definition?.value ? { documentation: definition.value } : {}),
        sortText: `${definition ? '0' : '1'}_${name}`,
        replaceLength: context.prefix.length,
      }
    })
}

/** Register editor-neutral BibTeX/biblatex completion domains. */
export function registerBibCompletionResolvers(registry: CompletionResolverRegistry): void {
  registry.registerResolver('bib-entry-type', (context) =>
    context.type === 'bibtex' ? entryTypeItems(context) : [],
  )
  registry.registerResolver('bib-field', (context) =>
    context.type === 'bibtex' ? fieldItems(context) : [],
  )
  registry.registerResolver('bib-entry-key', (context, environment) =>
    context.type === 'bibtex' ? entryKeyItems(context, environment) : [],
  )
  registry.registerResolver('bib-string', (context, environment) =>
    context.type === 'bibtex' ? stringItems(context, environment) : [],
  )
}
