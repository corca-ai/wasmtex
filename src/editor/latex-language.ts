import type * as Monaco from 'monaco-editor'

export const latexLanguage: Monaco.languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.latex',

  brackets: [
    { open: '{', close: '}', token: 'delimiter.curly' },
    { open: '[', close: ']', token: 'delimiter.bracket' },
    { open: '(', close: ')', token: 'delimiter.parenthesis' },
  ],

  tokenizer: {
    root: [
      // Comments
      [/%.*$/, 'comment'],

      // Math mode
      [/\$\$/, { token: 'string.math', next: '@mathDouble' }],
      [/\$/, { token: 'string.math', next: '@mathInline' }],

      // Commands
      [/\\begin\{/, { token: 'keyword', next: '@envName' }],
      [/\\end\{/, { token: 'keyword', next: '@envName' }],
      [/\\[a-zA-Z@]+\*?/, 'keyword'],
      [/\\[^a-zA-Z]/, 'keyword'],

      // Braces
      [/[{}]/, 'delimiter.curly'],
      [/[[\]]/, 'delimiter.bracket'],

      // Special characters
      [/[&~^_]/, 'keyword.operator'],
    ],

    mathInline: [
      [/[^$\\]+/, 'string.math'],
      [/\\[a-zA-Z]+/, 'string.math.keyword'],
      [/\\[^a-zA-Z]/, 'string.math.keyword'],
      [/\$/, { token: 'string.math', next: '@pop' }],
    ],

    mathDouble: [
      [/[^$\\]+/, 'string.math'],
      [/\\[a-zA-Z]+/, 'string.math.keyword'],
      [/\\[^a-zA-Z]/, 'string.math.keyword'],
      [/\$\$/, { token: 'string.math', next: '@pop' }],
    ],

    envName: [
      [/[a-zA-Z*]+/, 'type'],
      [/\}/, { token: 'keyword', next: '@pop' }],
    ],
  },
}

export const latexLanguageConfig: Monaco.languages.LanguageConfiguration = {
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
    { open: '$', close: '$' },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '$', close: '$' },
  ],
}
