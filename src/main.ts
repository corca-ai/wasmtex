import type { WasmTexOptions } from './component-types'
import { configureMonacoWorkers } from './editor/workers'
import { warmup } from './engine/warmup'
import { defaultFileContent } from './fs/default-file-content'
import type { SectionDef } from './lsp/types'
import { mergeDiagnostics, type PanelDiagnostic, resolveAddFile } from './main-helpers'
import type { AppStatus, WarmupCache } from './types'
import { hasErrorsOrWarnings } from './ui/diagnostics-panel'
import { configurePdfjsWorker } from './viewer/pdf-viewer'
import { WasmTex } from './wasmtex'
import './styles.css'

// Start warmup immediately — fetches TeX Live files in parallel while
// Monaco and the rest of the UI loads. Skipped when the built-in persistent
// cache (`?cache=1`) is active, since the durable cache seeds the engine and a
// network warmup on every load would defeat the "near-zero fetches" goal.
const persistentCacheRequested = new URLSearchParams(window.location.search).get('cache') === '1'
const warmupPromise: Promise<WarmupCache> | null = persistentCacheRequested ? null : warmup()
const WARMUP_TIMEOUT_MS = 8_000

// Configure workers for the demo app — must happen before WasmTex is created
// so that the bundler (Vite) resolves the worker files from node_modules.
configureMonacoWorkers()
configurePdfjsWorker()

const editorContainer = document.getElementById('editor-container')!
const previewContainer = document.getElementById('preview-container')!
const fileTreeContainer = document.getElementById('file-tree-list') as HTMLDivElement
const outlineContainer = document.getElementById('outline-list') as HTMLDivElement
const errorLogPanel = document.getElementById('error-log-panel') as HTMLDivElement
const errorLogList = document.getElementById('error-log-list') as HTMLDivElement
const errorCountElement = document.getElementById('error-count') as HTMLSpanElement
const addFileButton = document.getElementById('add-file-btn') as HTMLButtonElement
const texliveVersionSelect = document.getElementById('texlive-version') as HTMLSelectElement
const projectSelect = document.getElementById('project-select') as HTMLSelectElement
const statusElement = document.getElementById('status') as HTMLSpanElement
const statusDetailElement = document.getElementById('status-detail') as HTMLSpanElement
let editorRef: WasmTex | null = null
let lastCompileErrors: PanelDiagnostic[] = []
// Static (LSP/lint) diagnostics, kept so a compile re-renders the union instead of
// clobbering them out of the panel.
let lastDiagnostics: PanelDiagnostic[] = []

const DEFAULT_TEXLIVE = '2025' as const
const DEFAULT_PROJECT = 'default' as const
type DemoTexliveVersion = '2025'
type DemoProject = 'default' | 'sample'

const SAMPLE_FILES = ['main.tex', 'introduction.tex', 'refs.bib']

const FILE_EXTENSIONS_THAT_ARE_BINARY = /\.(png|jpg|jpeg|gif|pdf)$/i

interface DemoConfig {
  texliveVersion: DemoTexliveVersion
  project: DemoProject
  persistentCache: boolean
  incremental: boolean
}

function readDemoConfig(): DemoConfig {
  const urlParams = new URLSearchParams(window.location.search)
  const tlParam = urlParams.get('tl')
  const texliveVersion = tlParam === '2025' ? tlParam : DEFAULT_TEXLIVE
  const projParam = urlParams.get('proj')
  const project = projParam === 'sample' ? 'sample' : DEFAULT_PROJECT
  const persistentCache = urlParams.get('cache') === '1'
  // `?incremental=1` opts the demo into the incremental fast path (#99), for the e2e.
  const incremental = urlParams.get('incremental') === '1'

  return { texliveVersion, project, persistentCache, incremental }
}

function setDemoParam(key: string, value: string | null): void {
  const url = new URL(window.location.href)

  if (value) {
    url.searchParams.set(key, value)
  } else {
    url.searchParams.delete(key)
  }

  if (url.toString() !== window.location.href) window.location.href = url.toString()
}

const sectionIndentByLevel: Record<SectionDef['level'], number> = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
}

let activeFile = 'main.tex'

function loadSampleProject(): Promise<Record<string, string | Uint8Array>> {
  const timestamp = Date.now()
  const files: Record<string, string | Uint8Array> = {}

  const loaders = SAMPLE_FILES.map(async (name) => {
    const resp = await fetch(`${import.meta.env.BASE_URL}sample/${name}?t=${timestamp}`)

    if (!resp.ok) return

    const isBinary = FILE_EXTENSIONS_THAT_ARE_BINARY.test(name)

    files[name] = isBinary ? new Uint8Array(await resp.arrayBuffer()) : await resp.text()
  })

  return Promise.all(loaders).then(() => files)
}

function renderFileList(files: string[]): void {
  const normalized = [...new Set(files)].sort((a, b) => a.localeCompare(b))

  if (normalized.length === 0) {
    fileTreeContainer.innerHTML = '<div class="file-item">No files</div>'
    return
  }

  if (!normalized.includes(activeFile)) {
    if (normalized.includes('main.tex')) activeFile = 'main.tex'
    else activeFile = normalized[0]!
  }

  fileTreeContainer.innerHTML = ''

  for (const filePath of normalized) {
    const item = document.createElement('div')

    item.className = `file-item${filePath === activeFile ? ' active' : ''}`
    item.textContent = filePath
    item.title = filePath

    item.addEventListener('click', () => {
      activeFile = filePath
      if (!editorRef) return

      editorRef.openFile(filePath)
      renderFileList(editorRef.listFiles())
    })

    if (filePath !== 'main.tex') {
      const del = document.createElement('button')

      del.className = 'delete-btn'
      del.textContent = 'x'
      del.title = `Delete ${filePath}`
      del.addEventListener('click', (event) => {
        event.stopPropagation()

        if (!confirm(`Delete ${filePath}?`)) return

        if (editorRef) editorRef.deleteFile(filePath)
      })

      item.appendChild(del)
    }

    fileTreeContainer.appendChild(item)
  }
}

function renderOutline(sections: SectionDef[]): void {
  outlineContainer.innerHTML = ''

  if (sections.length === 0) {
    const empty = document.createElement('div')

    empty.className = 'outline-empty'
    empty.textContent = 'No sections found'
    outlineContainer.appendChild(empty)
    return
  }

  const list = document.createElement('div')
  list.className = 'outline-list'

  for (const section of sections) {
    const item = document.createElement('div')
    item.className = 'outline-item'
    item.style.paddingLeft = `${sectionIndentByLevel[section.level] * 12 + 4}px`
    item.textContent = section.title
    item.title = `${section.title} (line ${section.location.line})`
    item.addEventListener('click', () => {
      activeFile = section.location.file
      if (!editorRef) return

      editorRef.revealLine(section.location.line, section.location.file)
      renderFileList(editorRef.listFiles())
    })

    list.appendChild(item)
  }

  outlineContainer.appendChild(list)
}

function renderDiagnostics(
  diagnostics: Array<{ file?: string; line: number; message: string; severity: string }>,
): void {
  errorLogList.innerHTML = ''

  const errors = diagnostics.filter((entry) => entry.severity === 'error')

  errorCountElement.textContent = `${errors.length}/${diagnostics.length}`

  if (diagnostics.length === 0) {
    errorLogPanel.classList.remove('open')

    const empty = document.createElement('div')
    empty.className = 'log-entry'
    empty.textContent = 'No diagnostics'
    errorLogPanel.style.height = '0'
    errorLogList.appendChild(empty)
    return
  }

  errorLogPanel.classList.add('open')
  errorLogPanel.style.height = ''

  for (const entry of diagnostics) {
    const item = document.createElement('div')

    item.className = `log-entry ${entry.severity}`
    item.textContent = `${entry.file ? `${entry.file}:` : ''}${entry.line} ${entry.message}`

    if (entry.file) {
      item.classList.add('clickable')
      item.title = 'Click to jump to line'
      item.addEventListener('click', () => {
        if (editorRef) editorRef.revealLine(entry.line, entry.file)
      })
    }

    errorLogList.appendChild(item)
  }

  if (!hasErrorsOrWarnings(diagnostics)) {
    errorLogPanel.classList.remove('open')
  }
}

function renderStatus(status: AppStatus, message?: string): void {
  const labels: Record<AppStatus, string> = {
    unloaded: 'Initializing...',
    loading: 'Loading engine...',
    ready: 'Ready',
    compiling: 'Compiling...',
    error: 'Error',
    rendering: 'Rendering PDF...',
  }

  statusElement.textContent = labels[status]
  statusDetailElement.textContent = message ?? ''
}

async function getWarmupCache(): Promise<WarmupCache | undefined> {
  if (!warmupPromise) return undefined
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      warmupPromise,
      new Promise<undefined>((resolve) => {
        timeoutId = setTimeout(() => resolve(undefined), WARMUP_TIMEOUT_MS)
      }),
    ])
  } catch (err) {
    console.warn('[main] Warmup failed; continuing without preloaded TeX Live files.', err)
    return undefined
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

async function start() {
  const config = readDemoConfig()

  let files: Record<string, string | Uint8Array> | undefined

  if (config.project === 'sample') {
    console.log('[main] Loading "Paper Sample" project...')
    files = await loadSampleProject()
  }

  const warmupCache = await getWarmupCache()

  const opts: WasmTexOptions = {
    texliveVersion: config.texliveVersion,
    persistentCache: config.persistentCache,
    incremental: config.incremental,
  }
  if (warmupCache) opts.warmupCache = warmupCache
  if (files) {
    opts.files = files
  }

  const editor = new WasmTex(editorContainer, previewContainer, opts)
  editorRef = editor
  editor.on('filesUpdate', ({ files }) => {
    renderFileList(files)
  })

  editor.on('outlineUpdate', ({ sections }) => {
    renderOutline(sections)
  })

  editor.on('diagnostics', ({ diagnostics }) => {
    lastDiagnostics = diagnostics
    renderDiagnostics(mergeDiagnostics(lastCompileErrors, lastDiagnostics))
  })

  editor.on('status', ({ status, message, incremental }) => {
    renderStatus(status, message)
    const globals = globalThis as Record<string, unknown>
    globals.__lastStatus = { status, message, incremental: !!incremental }
    // E2E (#99): count incremental fast paints vs full-reconcile 'ready's.
    if (status === 'ready') {
      if (incremental) globals.__incrementalPaints = Number(globals.__incrementalPaints ?? 0) + 1
      else globals.__fullReadys = Number(globals.__fullReadys ?? 0) + 1
    }
  })

  editor.on('compile', ({ result }) => {
    const globals = globalThis as Record<string, unknown>
    globals.__compileCount = Number(globals.__compileCount ?? 0) + 1
    globals.__lastCompile = result
    const history = Array.isArray(globals.__compileHistory) ? globals.__compileHistory : []
    history.push(result)
    globals.__compileHistory = history

    lastCompileErrors = result.errors
    renderDiagnostics(mergeDiagnostics(lastCompileErrors, lastDiagnostics))

    if (result.errors.length === 0) {
      console.log('[main] compile success')
    }
  })

  await editor.init()
  renderFileList(editor.listFiles())
  renderOutline([])
  renderDiagnostics([])

  addFileButton.addEventListener('click', () => {
    const decision = resolveAddFile(prompt('New file path'), (p) => editor.getFile(p) !== null)
    if (decision.action === 'cancel') return
    // Only create writes content; opening an existing file must not overwrite it.
    if (decision.action === 'create') {
      editor.setFile(decision.path, defaultFileContent(decision.path))
    }
    activeFile = decision.path
    editor.openFile(decision.path)
    renderFileList(editor.listFiles())
  })

  // E2E backward compat: expose globals
  ;(globalThis as Record<string, unknown>).__engine = (
    editor as unknown as { engine: unknown }
  ).engine
  ;(globalThis as Record<string, unknown>).__pdfViewer = editor.getViewer()
  ;(globalThis as Record<string, unknown>).__editor = editor.getMonacoEditor()
  ;(globalThis as Record<string, unknown>).__wasmTex = editor
}

function bindDemoSelectors(): void {
  const config = readDemoConfig()

  if (projectSelect) {
    projectSelect.value = config.project

    projectSelect.addEventListener('change', () => {
      setDemoParam('proj', projectSelect.value === DEFAULT_PROJECT ? null : projectSelect.value)
    })
  }

  if (texliveVersionSelect) {
    texliveVersionSelect.value = config.texliveVersion

    texliveVersionSelect.addEventListener('change', () => {
      const selected = texliveVersionSelect.value as DemoTexliveVersion
      setDemoParam('tl', selected)
    })
  }
}

bindDemoSelectors()

start().catch((err) => {
  console.error(err)
})
