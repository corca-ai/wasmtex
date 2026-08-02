import * as monaco from 'monaco-editor'

export interface MockModel {
  getValue(): string
  getLineContent(lineNumber: number): string
  uri: monaco.Uri
}

export function mockModel(lines: string[] = [], path = 'main.tex'): MockModel {
  const p = path.startsWith('/') ? path : `/${path}`
  return {
    getValue() {
      return lines.join('\n')
    },
    getLineContent(lineNumber: number) {
      return lines[lineNumber - 1] ?? ''
    },
    uri: monaco.Uri.parse(`file://${p}`),
  }
}
