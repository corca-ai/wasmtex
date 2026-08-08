import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import dts from 'vite-plugin-dts'

const monacoEditorApi = fileURLToPath(
  new URL('./node_modules/monaco-editor/esm/vs/editor/editor.api.js', import.meta.url),
)

/** Keep legal notices next to the standalone demo and hosted engine assets. */
function legalFilesPlugin(): Plugin {
  const licenseFiles = readdirSync(new URL('./LICENSES/', import.meta.url), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile())
    .map((entry) => `LICENSES/${entry.name}`)
  const files = [
    'LICENSE',
    'THIRD_PARTY_NOTICES.md',
    'docs/licensing.md',
    'docs/proprietary-integration.md',
    ...licenseFiles,
  ]

  return {
    name: 'wasmtex-legal-files',
    apply: 'build',
    generateBundle() {
      for (const fileName of files) {
        this.emitFile({
          type: 'asset',
          fileName,
          source: readFileSync(new URL(`./${fileName}`, import.meta.url), 'utf8'),
        })
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isLibBuild = env.BUILD_MODE === 'lib'
  const isTest = mode === 'test'

  return {
    base: env.BASE_URL || '/',
    publicDir: isLibBuild ? false : 'public',
    // rollupTypes:false (the default) emits one .d.ts per source module — mirroring the
    // preserveModules JS output — so re-exported named symbols are preserved. rollupTypes
    // bundled each entry into a single .d.ts but dropped the barrel's re-exports (#142).
    plugins: isLibBuild
      ? [dts({ exclude: ['**/*.test.ts', 'src/__mocks__/**', 'src/main.ts'] })]
      : [legalFilesPlugin()],
    resolve: {
      alias:
        isLibBuild || isTest
          ? []
          : [{ find: /^monaco-editor$/, replacement: monacoEditorApi }],
    },
    build: isLibBuild
      ? {
          target: 'es2022',
          // The published library bundle lives in `lib/` and is COMMITTED (so a
          // `github:` install resolves `exports` without a build step — see #146); the
          // demo-app / GitHub-Pages build keeps the default, gitignored `dist/`.
          outDir: 'lib',
          lib: {
            entry: {
              wasmtex: 'src/index.ts',
              headless: 'src/headless.ts',
              node: 'src/node.ts',
              synctex: 'src/synctex.ts',
              warmup: 'src/warmup.ts',
              lsp: 'src/lsp-service.ts',
              'lsp-monaco': 'src/lsp-monaco.ts',
              'lsp-server': 'src/lsp-server.ts',
              syntax: 'src/syntax.ts',
            },
            formats: ['es'] as const,
            fileName: (_format, entryName) => `${entryName}.js`,
          },
          cssFileName: 'wasmtex',
          rollupOptions: {
            external: [/^monaco-editor/, /^pdfjs-dist/, /^pdf-lib/, /^node:/],
            output: {
              // One file per source module: the emitted graph mirrors the source
              // import graph, so a monaco-free source entry (headless / node) never
              // pulls a monaco chunk via rollup's shared-chunk co-location. Keeps the
              // `wasmtex/headless` + `wasmtex/node` bundles importable under Node.
              preserveModules: true,
              preserveModulesRoot: 'src',
              assetFileNames: '[name][extname]',
              globals: {
                'monaco-editor': 'monaco',
                'pdfjs-dist': 'pdfjsLib',
              },
            },
          },
        }
      : {
          target: 'es2022',
          chunkSizeWarningLimit: 3200,
          rollupOptions: {
            output: {
              manualChunks(id) {
                if (id.includes('node_modules/monaco-editor')) return 'monaco'
                if (id.includes('node_modules/pdfjs-dist')) return 'pdfjs'
              },
            },
          },
        },
    server: {
      proxy: {
        '/texlive': {
          target: env.TEXLIVE_URL,
          changeOrigin: true,
          secure: false,
          rewrite: (path: string) => path.replace(/^\/texlive/, ''),
        },
      },
    },
  }
})
