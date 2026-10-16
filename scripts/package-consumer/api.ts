import { WasmTex, type WasmTexOptions, type CompileResult } from 'wasmtex'
import { WasmTexCompiler, BackendRegistry, type WasmTexCompilerOptions } from 'wasmtex/headless'
import { installNodeWorkerHost, type NodeWorkerHostOptions } from 'wasmtex/node'
import { SynctexParser, VisibleTextIndex, projectVisibleTextSource, type SynctexData, type VisibleTextSourceProjection, type VisibleTextSourceMatch, type VisibleTextPdfPage } from 'wasmtex/synctex'
import { warmup, type WarmupOptions } from 'wasmtex/warmup'
import { createLatexLanguageService, type LatexLanguageServiceOptions } from 'wasmtex/lsp'
import { registerLatexMonacoProviders, type LatexMonacoProviderOptions } from 'wasmtex/lsp/monaco'
import { LatexLspServer, type JsonRpcMessage } from 'wasmtex/lsp/server'
import { createLatexSyntaxService, type LatexDocumentInput } from 'wasmtex/syntax'

export const publicValues = {
  WasmTex,
  WasmTexCompiler,
  BackendRegistry,
  installNodeWorkerHost,
  SynctexParser,
  VisibleTextIndex,
  projectVisibleTextSource,
  warmup,
  createLatexLanguageService,
  registerLatexMonacoProviders,
  LatexLspServer,
  createLatexSyntaxService,
}
export type PublicTypes = [
  WasmTexOptions,
  CompileResult,
  WasmTexCompilerOptions,
  NodeWorkerHostOptions,
  SynctexData,
  VisibleTextSourceProjection,
  VisibleTextSourceMatch,
  VisibleTextPdfPage,
  WarmupOptions,
  LatexLanguageServiceOptions,
  LatexMonacoProviderOptions,
  JsonRpcMessage,
  LatexDocumentInput,
]

export const options: WasmTexCompilerOptions = {
  files: { 'main.tex': '\\documentclass{article}' },
  engine: 'pdflatex',
  backends: new BackendRegistry(),
}
// A declaration graph that degenerates to `any` must not pass this consumer.
// @ts-expect-error only supported engine names are accepted
export const invalid: WasmTexCompilerOptions = { engine: 'unsupported-engine' }

const navigation = new VisibleTextIndex()
navigation.setPage({ page: 1, text: 'Linear Algebra', rangeRects: () => [] })
export const sourceCandidates: readonly VisibleTextSourceMatch[] = navigation.findSources('Linear Algebra').candidates
// @ts-expect-error renderer adapters must provide geometry as separate typed regions
navigation.setPage({ page: 1, text: 'Linear Algebra', rangeRects: () => 'invalid' })
