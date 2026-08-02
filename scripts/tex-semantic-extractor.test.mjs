import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  extractTexSemantics,
  mergeSemanticMetadata,
  scanTexCalls,
} from './lib/tex-semantic-extractor.mjs'

function family(result, name) {
  return result.keyFamilies.find((candidate) => candidate.name === name)
}

test('scans balanced TeX calls while ignoring comments', () => {
  const calls = scanTexCalls(String.raw`
% \DeclareOption{ignored}{x}
\DeclareOption{draft}{\setlength{\foo}{1pt}}
\keys_define:nn { pkg } { mode .choices:nn = { one, two } { } }
`)
  assert.deepEqual(
    calls.map((call) => [call.name, call.groups.map((group) => group.value)]),
    [
      ['DeclareOption', ['draft', String.raw`\setlength{\foo}{1pt}`]],
      ['keys_define:nn', [' pkg ', ' mode .choices:nn = { one, two } { } ']],
    ],
  )
})

test('extracts legacy options and kvoptions with typed values', () => {
  const result = extractTexSemantics({
    sourcePath: 'texmf-dist/tex/latex/example/example.sty',
    scopeKind: 'package',
    scopeName: 'example',
    source: String.raw`
\DeclareOption{draft}{\def\mode{draft}}
\DeclareOption*{\PackageWarning{example}{unknown}}
\SetupKeyvalOptions{family=setup,prefix=ex@}
\DeclareBoolOption[true]{enabled}
\DeclareStringOption[wide]{mode}
\DeclareComplementaryOption{disabled}{enabled}
\RequirePackage{etoolbox,expl3}
\LoadClassWithOptions{memoir}
`,
  })

  assert.deepEqual(
    family(result, 'package-options').keys.map((key) => [
      key.name,
      key.value.type,
      key.default ?? null,
      key.repeatable,
    ]),
    [
      ['disabled', 'flag', null, false],
      ['draft', 'flag', null, false],
      ['enabled', 'boolean', 'true', false],
      ['mode', 'free-text', 'wide', false],
    ],
  )
  assert.deepEqual(
    family(result, 'example/setup').keys.map((key) => key.name),
    ['disabled', 'enabled', 'mode'],
  )
  assert.match(result.unsupported[0].reason, /catch-all/)
  assert.deepEqual(result.dependencies, ['etoolbox', 'expl3', 'memoir'])
})

test('extracts define@key, l3keys, modern keys, and ProcessKeyOptions', () => {
  const result = extractTexSemantics({
    sourcePath: 'texmf-dist/tex/latex/example/example.sty',
    scopeKind: 'package',
    scopeName: 'example',
    source: String.raw`
\define@key{view}{width}[1pt]{\setlength\dimen@{#1}}
\keys_define:nn { example/setup } {
  enabled .bool_set:N = \l_enabled_bool,
  count .int_set:N = \l_count_int,
  width .dim_set:N = \l_width_dim,
  mode .choices:nn = { draft, final } { },
  title .tl_set:N = \l_title_tl,
  title .initial:n = Hello
}
\ProcessKeyOptions[example/setup]
\DeclareKeys[view]{angle .code:n = {#1}}
`,
  })

  assert.deepEqual(
    family(result, 'example/setup').keys.map((key) => [
      key.name,
      key.value.type,
      key.value.values ?? null,
    ]),
    [
      ['count', 'number', null],
      ['enabled', 'boolean', null],
      ['mode', 'enum', ['draft', 'final']],
      ['title', 'free-text', null],
      ['width', 'dimension', null],
    ],
  )
  assert.equal(family(result, 'example/view').keys.find((key) => key.name === 'width').default, '1pt')
  assert.equal(family(result, 'example/view').keys.find((key) => key.name === 'angle').value.type, 'free-text')
  assert.deepEqual(
    family(result, 'package-options').keys.map((key) => key.name),
    ['count', 'enabled', 'mode', 'title', 'width'],
  )
})

test('extracts pgf choice values and xparse command/environment signatures', () => {
  const result = extractTexSemantics({
    sourcePath: 'texmf-dist/tex/latex/example/example.sty',
    scopeKind: 'package',
    scopeName: 'example',
    source: String.raw`
\pgfkeys{/example/view/.cd,
  mode/.is choice,
  mode/draft/.code={x},
  mode/final/.code={x},
  enabled/.is if=example@if,
  width/.code={#1},
  width/.initial=2cm}
\NewDocumentCommand{\example}{O{default}m}{#2}
\NewDocumentEnvironment{exampleenv}{om}{}{}
`,
  })

  const view = family(result, 'example/view')
  assert.deepEqual(view.keys.find((key) => key.name === 'mode').value, {
    type: 'enum',
    values: ['draft', 'final'],
  })
  assert.equal(view.keys.find((key) => key.name === 'enabled').value.type, 'boolean')
  assert.equal(view.keys.find((key) => key.name === 'width').default, '2cm')
  assert.deepEqual(result.commands[0].args, [
    { kind: 'optional', valueKind: 'free-text' },
    { kind: 'required', valueKind: 'free-text' },
  ])
  assert.deepEqual(result.environments[0].args, [
    { kind: 'optional', valueKind: 'free-text' },
    { kind: 'required', valueKind: 'free-text' },
  ])
})

test('merges curated metadata with explicit provenance and deterministic ordering', () => {
  const base = extractTexSemantics({
    source: String.raw`\DeclareOption{draft}{x}`,
    sourcePath: 'book.cls',
    scopeKind: 'class',
    scopeName: 'book',
  })
  const merged = mergeSemanticMetadata(
    base,
    {
      keyFamilies: [
        {
          name: 'class-options',
          keys: [{ name: 'paper', value: { type: 'enum', values: ['a4paper', 'letterpaper'] }, repeatable: false }],
        },
      ],
    },
    {
      confidence: 'overridden',
      provenance: {
        evidence: 'override',
        sourcePath: 'scripts/tex-semantic-overrides-2025.json',
        extractor: 'curated-override',
      },
    },
  )

  assert.deepEqual(
    family(merged, 'class-options').keys.map((key) => key.name),
    ['draft', 'paper'],
  )
  assert.equal(family(merged, 'class-options').keys[1].provenance[0].evidence, 'override')
})
