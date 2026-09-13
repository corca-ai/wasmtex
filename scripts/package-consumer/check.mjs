#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const fixtures = dirname(fileURLToPath(import.meta.url))
const root = join(fixtures, '../..')
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
const temp = mkdtempSync(join(tmpdir(), 'wasmtex-consumer-'))
const env = { ...process.env }
delete env.NODE_PATH
delete env.NODE_OPTIONS
function run(command, args, cwd = temp, expectedFailure) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 180_000 })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (result.error) throw result.error
  assert.equal(result.signal, null, output)
  if (expectedFailure) {
    assert.notEqual(result.status, 0, 'Broken package unexpectedly passed')
    assert.match(output, expectedFailure)
  } else {
    assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${output}`)
  }
  return output
}
function write(name, value) {
  writeFileSync(join(temp, name), JSON.stringify(value, null, 2))
}
function typecheck(resolution, expectedFailure) {
  write('tsconfig.json', {
    compilerOptions: {
      target: 'ES2022',
      module: resolution === 'NodeNext' ? 'NodeNext' : 'ESNext',
      moduleResolution: resolution,
      strict: true,
      skipLibCheck: false,
      noEmit: true,
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      types: ['node'],
    },
    files: ['api.ts'],
  })
  for (const compiler of ['typescript/bin/tsc', '@typescript/native-preview/bin/tsgo.js']) {
    run(
      process.execPath,
      [`node_modules/${compiler}`, '-p', 'tsconfig.json'],
      temp,
      expectedFailure,
    )
  }
}

try {
  // No prepare/build: pack exactly the checked-out lib, then install a real copy
  // outside the repository so imports cannot find its src or devDependencies.
  const [packed] = JSON.parse(
    run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temp], root),
  )
  write('package.json', { name: 'wasmtex-package-consumer', private: true, type: 'module' })
  run('npm', [
    'install',
    '--ignore-scripts',
    '--legacy-peer-deps',
    '--no-audit',
    '--no-fund',
    join(temp, packed.filename),
  ])
  const installed = join(temp, 'node_modules/wasmtex')
  assert.equal(realpathSync(installed), join(realpathSync(temp), 'node_modules/wasmtex'))
  for (const absent of ['src', 'node_modules', 'public', 'wasm-build']) {
    assert(!existsSync(join(installed, absent)), `Package unexpectedly contains ${absent}`)
  }
  for (const peer of ['monaco-editor', 'pdfjs-dist', 'pdf-lib']) {
    assert(!existsSync(join(temp, 'node_modules', peer)), `Runtime probe must run without ${peer}`)
  }
  for (const required of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'LICENSES/SyncTeX.txt']) {
    assert(existsSync(join(installed, required)), `Package missing ${required}`)
  }
  cpSync(join(fixtures, 'runtime.mjs'), join(temp, 'runtime.mjs'))
  run(process.execPath, ['runtime.mjs'])
  console.log('consumer: seven Node/neutral runtime imports pass without UI/PDF peers')

  const pkg = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'))
  assert.deepEqual(
    Object.keys(pkg.exports).sort(),
    [
      '.',
      './headless',
      './node',
      './synctex',
      './warmup',
      './lsp',
      './lsp/monaco',
      './lsp/server',
      './syntax',
      './style.css',
      './wasmtex.css',
    ].sort(),
    'Update the consumer fixtures when the public entry points change',
  )
  for (const [entry, targets] of Object.entries(pkg.exports)) {
    for (const target of typeof targets === 'string' ? [targets] : Object.values(targets)) {
      assert(existsSync(join(installed, target)), `${entry} missing ${target}`)
    }
  }
  // Consumers choose their own tooling/peers. Install exact versions from this
  // checkout's lock instead of allowing repository ancestor resolution.
  const dependencies = [
    'typescript',
    '@typescript/native-preview',
    '@types/node',
    'vite',
    'monaco-editor',
    'pdfjs-dist',
    'pdf-lib',
  ].map((name) => `${name}@${lock.packages[`node_modules/${name}`].version}`)
  run('npm', [
    'install',
    '--ignore-scripts',
    '--legacy-peer-deps',
    '--no-audit',
    '--no-fund',
    ...dependencies,
  ])
  cpSync(join(fixtures, 'api.ts'), join(temp, 'api.ts'))
  for (const resolution of ['Bundler', 'NodeNext']) typecheck(resolution)
  console.log('consumer: tsc and tsgo resolve nine typed entries with Bundler and NodeNext')
  cpSync(join(fixtures, 'browser.mjs'), join(temp, 'browser.mjs'))
  writeFileSync(join(temp, 'index.html'), '<script type="module" src="/browser.mjs"></script>')
  run(process.execPath, ['node_modules/vite/bin/vite.js', 'build'])
  console.log('consumer: Vite bundles the installed UI/Monaco graph and both CSS aliases')

  // Prove the probes reject the two historical failure classes. Mutations touch
  // only the installed temp copy and are restored before cleanup.
  const javascript = join(installed, 'lib/headless.js')
  const savedJs = readFileSync(javascript)
  rmSync(javascript)
  try {
    run(process.execPath, ['runtime.mjs'], temp, /ERR_MODULE_NOT_FOUND/)
  } finally {
    writeFileSync(javascript, savedJs)
  }
  const declaration = join(installed, 'lib/node.d.ts')
  const savedDts = readFileSync(declaration, 'utf8')
  const brokenDts = savedDts.replace(/\btype NodeWorkerHostOptions,?\s*/, '')
  assert.notEqual(brokenDts, savedDts, 'Type-export mutation must remove its target')
  writeFileSync(declaration, brokenDts)
  try {
    typecheck('NodeNext', /has no exported member.*NodeWorkerHostOptions/)
  } finally {
    writeFileSync(declaration, savedDts)
  }
  console.log(
    'package consumer: ignore-scripts install, runtime boundaries, nine typed entries, both CSS exports, and negative probes pass',
  )
} finally {
  rmSync(temp, { recursive: true, force: true })
}
