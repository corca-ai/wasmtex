// Minimal monaco-editor mock for vitest
export const languages = {
  CompletionItemKind: {
    Function: 1,
    Variable: 5,
    Reference: 17,
    Module: 8,
    File: 16,
    Keyword: 13,
  },
  CompletionItemInsertTextRule: {
    InsertAsSnippet: 4,
  },
  SymbolKind: {
    Module: 1,
    Key: 19,
    Function: 11,
    Struct: 22,
  },
  registerCompletionItemProvider: () => ({ dispose() {} }),
  registerDefinitionProvider: () => ({ dispose() {} }),
  registerHoverProvider: () => ({ dispose() {} }),
  registerDocumentSymbolProvider: () => ({ dispose() {} }),
  registerReferenceProvider: () => ({ dispose() {} }),
  registerRenameProvider: () => ({ dispose() {} }),
  register: () => {},
  setMonarchTokensProvider: () => {},
  setLanguageConfiguration: () => {},
}

export class Uri {
  readonly scheme: string
  readonly path: string
  constructor(scheme: string, path: string) {
    this.scheme = scheme
    this.path = path.startsWith('/') ? path : `/${path}`
  }
  static file(path: string): Uri {
    return new Uri('file', path)
  }
  static parse(url: string): Uri {
    const scheme = url.split('://')[0]!
    const path = url.split('://')[1]!
    return new Uri(scheme, path)
  }
  with(change: { path?: string; scheme?: string }): Uri {
    return new Uri(change.scheme ?? this.scheme, change.path ?? this.path)
  }
  toString(): string {
    return `${this.scheme}://${this.path}`
  }
}

export class Range {
  readonly startLineNumber: number
  readonly startColumn: number
  readonly endLineNumber: number
  readonly endColumn: number
  constructor(startLine: number, startCol: number, endLine: number, endCol: number) {
    this.startLineNumber = startLine
    this.startColumn = startCol
    this.endLineNumber = endLine
    this.endColumn = endCol
  }
}

// Monaco marker severities (real numeric values).
export const MarkerSeverity = { Hint: 1, Info: 2, Warning: 4, Error: 8 } as const

// Back createModel/getModel with a per-URI registry that mirrors Monaco's real
// ModelService: a single global model per URI, and a throw on duplicate add.
interface MockModel {
  uri: Uri
  _value: string
  _language: string
  getValue(): string
  setValue(value: string): void
  getLineCount(): number
  getLineMaxColumn(line: number): number
  dispose(): void
}

const modelRegistry = new Map<string, MockModel>()
/** Per-model, per-owner marker store mirroring monaco's setModelMarkers/getModelMarkers. */
const markerStore = new Map<MockModel, Map<string, unknown[]>>()

export const editor = {
  create: () => ({}),
  createModel: (content?: string, language?: string, uri?: Uri): MockModel => {
    const key = uri?.toString()
    if (key !== undefined && modelRegistry.has(key)) {
      throw new Error('ModelService: Cannot add model because it already exists!')
    }
    const model: MockModel = {
      uri: uri ?? Uri.file('/anonymous'),
      _value: content ?? '',
      _language: language ?? 'plaintext',
      getValue() {
        return this._value
      },
      setValue(value: string) {
        this._value = value
      },
      getLineCount() {
        return this._value.split('\n').length
      },
      getLineMaxColumn(line: number) {
        return (this._value.split('\n')[line - 1]?.length ?? 0) + 1
      },
      dispose() {
        if (key !== undefined) modelRegistry.delete(key)
        markerStore.delete(this)
      },
    }
    if (key !== undefined) modelRegistry.set(key, model)
    return model
  },
  getModel: (uri: Uri): MockModel | null => modelRegistry.get(uri.toString()) ?? null,
  getModels: (): MockModel[] => [...modelRegistry.values()],
  setModelMarkers: (model: MockModel, owner: string, markers: unknown[]): void => {
    const byOwner = markerStore.get(model) ?? new Map<string, unknown[]>()
    byOwner.set(owner, markers)
    markerStore.set(model, byOwner)
  },
  getModelMarkers: (filter: { owner?: string; resource?: Uri }): unknown[] => {
    const out: unknown[] = []
    for (const [model, byOwner] of markerStore) {
      if (filter.resource && model.uri.toString() !== filter.resource.toString()) continue
      for (const [owner, markers] of byOwner) {
        if (filter.owner && owner !== filter.owner) continue
        out.push(...markers)
      }
    }
    return out
  },
}

/** Test-only: clear the global model registry so tests stay isolated. */
export function __resetMonacoModels(): void {
  modelRegistry.clear()
  markerStore.clear()
}

export default {
  languages,
  Uri,
  Range,
  MarkerSeverity,
  editor,
}
