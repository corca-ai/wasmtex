import * as monaco from 'monaco-editor'
import { bibLanguage, bibLanguageConfig } from './bib-language'
import { latexLanguage, latexLanguageConfig } from './latex-language'

let languagesRegistered = false
let workersConfigured = false

interface MonacoEnvironmentHost {
  MonacoEnvironment?: {
    getWorker?(workerId: string, label: string): Worker
  }
}

// `globalThis` resolves to the worker/window global (`self`) in the browser and
// is also defined under Node, so importing this module in a test env is safe.
const workerHost = globalThis as unknown as MonacoEnvironmentHost

/** Register LaTeX and BibTeX languages with Monaco. Safe to call multiple times.
 *  Exported so that host apps using an external editor can register syntax
 *  highlighting before creating their own Monaco instance. */
export function ensureLanguagesRegistered(): void {
  if (languagesRegistered) return
  languagesRegistered = true

  // Register LaTeX language
  monaco.languages.register({ id: 'latex' })
  monaco.languages.setMonarchTokensProvider('latex', latexLanguage)
  monaco.languages.setLanguageConfiguration('latex', latexLanguageConfig)

  // Register BibTeX language
  monaco.languages.register({ id: 'bibtex' })
  monaco.languages.setMonarchTokensProvider('bibtex', bibLanguage)
  monaco.languages.setLanguageConfiguration('bibtex', bibLanguageConfig)
}

/** Ensure Monaco web workers are configured.
 *
 *  When used as a **library** (installed via npm/bun), the consumer's bundler
 *  must handle Monaco worker URLs. Configure `self.MonacoEnvironment`
 *  manually. See the Integration Guide for details.
 *
 *  The built-in fallback only works when the source is processed directly by
 *  Vite (i.e. the demo app / `npm run dev`). */
function ensureWorkersConfigured(): void {
  if (workersConfigured) return
  workersConfigured = true

  if (workerHost.MonacoEnvironment?.getWorker) return

  console.warn(
    '[WasmTex] MonacoEnvironment.getWorker is not configured. ' +
      'Monaco editor workers may fail to load. ' +
      'Set self.MonacoEnvironment before creating WasmTex. ' +
      'See the Integration Guide (docs/howto.md) for a ready-to-use snippet.',
  )
}

function ensureMonacoConfigured(): void {
  ensureWorkersConfigured()
  ensureLanguagesRegistered()
}

/** Create a Monaco text model for a project file.
 *
 *  `overwriteOnReuse` controls what happens when a model for this URI already
 *  exists in Monaco's global registry (e.g. a second WasmTex instance, or a
 *  re-create after an incomplete teardown): when true (default) the existing
 *  model's content is synced via `setValue`; when false the existing model is
 *  returned untouched. Pass false under collaboration so an external CRDT binding
 *  stays the single source of truth (WasmTex never calls `setValue` then). */
export function createFileModel(
  content: string,
  filePath: string,
  overwriteOnReuse = true,
): monaco.editor.ITextModel {
  ensureLanguagesRegistered()
  const lang = filePath.endsWith('.tex')
    ? 'latex'
    : filePath.endsWith('.bib')
      ? 'bibtex'
      : 'plaintext'
  const path = filePath.startsWith('/') ? filePath : `/${filePath}`
  const uri = monaco.Uri.file(path)
  // Monaco keeps a single global model per URI and throws on a duplicate add.
  // Reuse an existing model instead of crashing.
  const existing = monaco.editor.getModel(uri)
  if (existing) {
    if (overwriteOnReuse && existing.getValue() !== content) existing.setValue(content)
    return existing
  }
  return monaco.editor.createModel(content, lang, uri)
}

/** Create the Monaco editor instance with an existing model. */
export function createEditor(
  container: HTMLElement,
  model: monaco.editor.ITextModel,
): monaco.editor.IStandaloneCodeEditor {
  ensureMonacoConfigured()
  return monaco.editor.create(container, {
    model,
    theme: 'vs-dark',
    fontSize: 14,
    lineNumbers: 'on',
    minimap: { enabled: false },
    wordWrap: 'on',
    automaticLayout: true,
    scrollBeyondLastLine: false,
    renderWhitespace: 'none',
    tabSize: 2,
  })
}

export function revealLine(editor: monaco.editor.IStandaloneCodeEditor, line: number): void {
  editor.revealLineInCenter(line)
  editor.setPosition({ lineNumber: line, column: 1 })
  editor.focus()
}
