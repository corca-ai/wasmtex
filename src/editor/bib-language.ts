import type * as Monaco from 'monaco-editor'

export const bibLanguage: Monaco.languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.bib',

  tokenizer: {
    root: [
      [/@\w+/, { token: 'keyword', next: '@entry' }],
      [/%.*$/, 'comment'],
      [/[^{},]+/, 'string'],
    ],

    entry: [
      // Consume whitespace between the entry type and the delimiter (`@article {key}` is
      // legal) so the `{` rule still fires; otherwise the catch-all below pops to root and
      // the entry body loses field highlighting.
      [/[ \t\r\n]+/, 'white'],
      [/{/, { token: 'delimiter.curly', next: '@body' }],
      [/[^a-zA-Z0-9]/, { token: '', next: '@pop' }],
    ],

    body: [
      [/[a-zA-Z0-9_-]+(?=\s*=)/, 'attribute.name'],
      [/=/, 'delimiter'],
      [/{/, { token: 'delimiter.curly', next: '@curlyString' }],
      [/"/, { token: 'string', next: '@doubleQuoteString' }],
      [/,/, 'delimiter'],
      [/}/, { token: 'delimiter.curly', next: '@popall' }],
      [/[ \t\r\n]+/, 'white'],
    ],

    curlyString: [
      [/[^{}]+/, 'string'],
      [/{/, { token: 'delimiter.curly', next: '@curlyString' }],
      [/}/, { token: 'delimiter.curly', next: '@pop' }],
    ],

    doubleQuoteString: [
      [/[^"]+/, 'string'],
      [/"/, { token: 'string', next: '@pop' }],
    ],
  },
}

export const bibLanguageConfig: Monaco.languages.LanguageConfiguration = {
  comments: {
    lineComment: '%',
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
  ],
}
