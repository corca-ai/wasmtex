import * as monaco from 'monaco-editor'

export interface MockModel {
  getLineContent(lineNumber: number): string
  uri: monaco.Uri
}

export function mockModel(lines: string[] = [], path = 'main.tex'): MockModel {
  const p = path.startsWith('/') ? path : `/${path}`
  return {
    getLineContent(lineNumber: number) {
      return lines[lineNumber - 1] ?? ''
    },
    uri: monaco.Uri.parse(`file://${p}`),
  }
}
