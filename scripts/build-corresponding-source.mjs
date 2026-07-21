#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkCorrespondingSourceDirectory, hashFile } from './lib/corresponding-source.mjs'
import { validateSourceConfig } from './lib/engine-build-receipt.mjs'
import { inspectReleaseAssets, validateWrittenAssetManifest } from './lib/release-assets.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs(argv) {
  const values = {}
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (!key.startsWith('--')) throw new Error(`unexpected argument: ${key}`)
    const value = argv[++i]
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`)
    values[key.slice(2)] = value
  }
  return values
}

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...options })
      .trim()
  } catch (error) {
    throw new Error(`${command} ${args.join(' ')} failed`, { cause: error })
  }
}

function hasCommit(repository, commit) {
  const result = spawnSync('git', ['-C', repository, 'cat-file', '-e', `${commit}^{commit}`], {
    stdio: 'ignore',
  })
  return result.status === 0
}

function ensureRepository({ name, url, commit, preferred, cache }) {
  if (preferred && existsSync(preferred) && hasCommit(preferred, commit)) return preferred
  const repository = join(cache, `${name}.git`)
  if (!existsSync(repository)) {
    mkdirSync(dirname(repository), { recursive: true })
    run('git', ['clone', '--bare', '--filter=blob:none', url, repository])
  }
  if (!hasCommit(repository, commit)) run('git', ['-C', repository, 'fetch', '--depth', '1', 'origin', commit])
  if (!hasCommit(repository, commit)) throw new Error(`${name}: source commit is unavailable: ${commit}`)
  return repository
}

function archiveGit(repository, commit, destination, temporary) {
  const archive = join(temporary, `${basename(destination)}-${commit}.tar`)
  mkdirSync(destination, { recursive: true })
  run('git', ['-C', repository, 'archive', '--format=tar', `--output=${archive}`, commit])
  run('tar', ['-xf', archive, '-C', destination])
  return run('git', ['-C', repository, 'rev-parse', `${commit}^{tree}`])
}

async function fetchVerified(url, destination, expectedSha512) {
  if (!existsSync(destination)) {
    mkdirSync(dirname(destination), { recursive: true })
    const response = await fetch(url)
    if (!response.ok) throw new Error(`download failed (${response.status}): ${url}`)
    const temporary = `${destination}.partial`
    writeFileSync(temporary, Buffer.from(await response.arrayBuffer()))
    if (hashFile('sha512', temporary) !== expectedSha512) {
      rmSync(temporary, { force: true })
      throw new Error(`downloaded source archive SHA-512 mismatch: ${url}`)
    }
    copyFileSync(temporary, destination)
    rmSync(temporary, { force: true })
  }
  if (hashFile('sha512', destination) !== expectedSha512) {
    throw new Error(`cached source archive SHA-512 mismatch: ${destination}`)
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function sourceReadme(releaseId) {
  return `# WasmTex complete corresponding source\n\nThis archive contains the source inputs and build control files for engine release\n\`${releaseId}\`. It intentionally contains no engine binaries. See \`release/manifest.json\`\nand the build receipts for their exact hashes.\n\nThe WasmTex host application or Cortex proprietary source is not part of this engine\ndistribution and is not needed to build the engine artifacts.\n`
}

function rebuildReadme(manifest) {
  const revisions = manifest.sources.wasmtex.map((source) => `- \`${source.commit}\``).join('\n')
  return `# Rebuild inputs\n\nThe exact WasmTex source snapshots used by the build receipts are:\n\n${revisions}\n\nThe pinned TeX Live source is under \`source/texlive/\`; the unused legacy\n\`libs/pplib\` directory is deliberately absent. WTPDF/Xpdf integration, SHA-2 source,\nDockerfiles, worker glue, and build scripts are in each WasmTex snapshot.\n\nEmscripten source is under \`source/emscripten/\`. Exact source archives for every\nEmscripten port used by these builds are under \`source/ports/\`. The build image is\n\`${manifest.buildEnvironment.dockerImage}\`.\n\nRun the original build workflow from the snapshot named by each receipt. A release is\nnot approved until a clean builder rebuild has been compared with the receipt-bound\nartifact bytes and any deterministic differences have been recorded.\n`
}

function relinkReadme(manifest) {
  const revision = manifest.sources.wasmtex[0].commit
  return `# Relinking statically linked LGPL libraries

The engine executables statically link the following libraries under their selected
LGPL alternatives:

- kpathsea 6.4.1: LGPL-2.1-or-later (all executable families);
- Graphite2 1.3.14: LGPL-2.1-or-later (XeTeX and LuaHBTeX);
- TECkit 2.5.12: LGPL-2.1-or-later (XeTeX); and
- zziplib 0.13.72: LGPL-2.0-or-later (LuaHBTeX).

This archive supplies source, rather than only pre-linked object code, as the
machine-readable material used to modify and relink those libraries. The exact
archive-to-component choices are in \`release/ENGINE-COMPONENTS.json\`.

1. Start from \`source/wasmtex/${revision}\` and the bundled
   \`source/texlive\`, \`source/emscripten\`, and \`source/ports\` inputs.
2. Replace the desired library source under \`source/texlive\` with a modified
   compatible version. For the Emscripten ports, replace the corresponding verified
   archive under \`source/ports\` and update the local build input deliberately.
3. Run the family build described in \`REBUILD.md\`. The build scripts compile the
   selected library and then perform the final Emscripten link; no pre-linked engine
   object is required.
4. Keep the chosen LGPL text and modified-library source with the resulting binary.

The build may be changed for private debugging, and WasmTex imposes no term that
forbids reverse engineering of the distributed executable for debugging changes to
the LGPL-covered portions. This file is a technical relink recipe, not a change to
any upstream license.
`
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  for (const required of ['assets', 'output-dir']) {
    if (!args[required]) throw new Error(`--${required} is required`)
  }
  const assets = resolve(args.assets)
  const outputDir = resolve(args['output-dir'])
  const cache = resolve(args.cache ?? join(tmpdir(), 'wasmtex-corresponding-source-cache'))
  const configPath = resolve(args.config ?? join(root, 'scripts/corresponding-source-2025.json'))
  const config = readJson(configPath)
  validateSourceConfig(config)
  const legal = readJson(join(assets, 'LICENSE-MANIFEST.json'))
  const assetManifest = readJson(join(assets, 'manifest.json'))
  const inspected = inspectReleaseAssets({ directory: assets, legal, sourceConfig: config })
  const assetFailures = [...inspected.errors, ...validateWrittenAssetManifest(assetManifest, inspected)]
  if (inspected.buildReceipts.length === 0) assetFailures.push('no engine build receipts found')
  if (assetFailures.length > 0) {
    throw new Error(`engine release inputs are not source-bound:\n- ${assetFailures.join('\n- ')}`)
  }
  if (!/^\d{4}-[a-f0-9]{16}$/i.test(assetManifest.releaseId ?? '')) {
    throw new Error('invalid asset manifest releaseId')
  }
  if (assetManifest.version !== config.texliveYear) throw new Error('asset/config TeX Live year mismatch')

  mkdirSync(outputDir, { recursive: true })
  mkdirSync(cache, { recursive: true })
  const archivePath = join(outputDir, `wasmtex-${assetManifest.releaseId}-source.tar.xz`)
  if (existsSync(archivePath)) throw new Error(`refusing to overwrite source archive: ${archivePath}`)
  const temporary = mkdtempSync(join(tmpdir(), 'wasmtex-source-build-'))
  try {
    const bundleName = `wasmtex-${assetManifest.releaseId}-source`
    const bundle = join(temporary, bundleName)
    mkdirSync(join(bundle, 'release'), { recursive: true })
    mkdirSync(join(bundle, 'source/wasmtex'), { recursive: true })
    mkdirSync(join(bundle, 'source/ports'), { recursive: true })
    copyFileSync(join(assets, 'manifest.json'), join(bundle, 'release/manifest.json'))
    copyFileSync(
      join(assets, 'LICENSE-MANIFEST.json'),
      join(bundle, 'release/LICENSE-MANIFEST.json'),
    )
    for (const receipt of inspected.receiptFiles) {
      copyFileSync(join(assets, receipt.name), join(bundle, 'release', receipt.name))
    }
    copyFileSync(configPath, join(bundle, 'corresponding-source-config.json'))
    copyFileSync(
      join(root, `scripts/engine-components-${config.texliveYear}.json`),
      join(bundle, 'release/ENGINE-COMPONENTS.json'),
    )

    const revisions = [...new Set(inspected.receipts.map((receipt) => receipt.value.sourceRevision))].sort()
    const wasmtexRepository = ensureRepository({
      name: 'wasmtex',
      url: config.wasmtex.repository,
      commit: revisions[0],
      preferred: root,
      cache,
    })
    const wasmtexSources = []
    for (const revision of revisions) {
      const repository = hasCommit(wasmtexRepository, revision)
        ? wasmtexRepository
        : ensureRepository({
            name: 'wasmtex',
            url: config.wasmtex.repository,
            commit: revision,
            preferred: root,
            cache,
          })
      const destination = join(bundle, 'source/wasmtex', revision)
      const tree = archiveGit(repository, revision, destination, temporary)
      wasmtexSources.push({
        repository: config.wasmtex.repository,
        commit: revision,
        tree,
        path: `source/wasmtex/${revision}`,
      })
    }

    const texliveCommit = legal.texliveSourceCommit
    const texliveRepository = ensureRepository({
      name: 'texlive-source',
      url: config.texliveSource.repository,
      commit: texliveCommit,
      preferred: args['texlive-repository'] ? resolve(args['texlive-repository']) : null,
      cache,
    })
    const texliveDestination = join(bundle, 'source/texlive')
    const texliveTree = archiveGit(texliveRepository, texliveCommit, texliveDestination, temporary)
    rmSync(join(texliveDestination, 'libs/pplib'), { recursive: true, force: true })

    const emscriptenRepository = ensureRepository({
      name: 'emscripten',
      url: config.emscripten.repository,
      commit: config.emscripten.commit,
      preferred: args['emscripten-repository'] ? resolve(args['emscripten-repository']) : null,
      cache,
    })
    const emscriptenTree = archiveGit(
      emscriptenRepository,
      config.emscripten.commit,
      join(bundle, 'source/emscripten'),
      temporary,
    )

    for (const port of config.ports) {
      const cached = join(cache, 'ports', port.filename)
      await fetchVerified(port.url, cached, port.sha512)
      copyFileSync(cached, join(bundle, 'source/ports', port.filename))
    }

    const sourceManifest = {
      schemaVersion: 1,
      releaseId: assetManifest.releaseId,
      engineAssetManifest: {
        path: 'release/manifest.json',
        sha256: hashFile('sha256', join(assets, 'manifest.json')),
      },
      licenseManifest: {
        path: 'release/LICENSE-MANIFEST.json',
        sha256: hashFile('sha256', join(assets, 'LICENSE-MANIFEST.json')),
      },
      buildEnvironment: { dockerImage: config.emscripten.dockerImage },
      sources: {
        wasmtex: wasmtexSources,
        texlive: {
          repository: config.texliveSource.repository,
          commit: texliveCommit,
          tree: texliveTree,
          path: 'source/texlive',
          excludedUnusedPaths: ['libs/pplib'],
        },
        emscripten: {
          repository: config.emscripten.repository,
          commit: config.emscripten.commit,
          tree: emscriptenTree,
          path: 'source/emscripten',
        },
        ports: config.ports.map((port) => ({ ...port, path: `source/ports/${port.filename}` })),
      },
    }
    writeFileSync(join(bundle, 'SOURCE-MANIFEST.json'), `${JSON.stringify(sourceManifest, null, 2)}\n`)
    writeFileSync(join(bundle, 'README.md'), sourceReadme(assetManifest.releaseId))
    writeFileSync(join(bundle, 'REBUILD.md'), rebuildReadme(sourceManifest))
    writeFileSync(join(bundle, 'RELINK.md'), relinkReadme(sourceManifest))

    const failures = checkCorrespondingSourceDirectory({
      directory: bundle,
      config,
      assetManifest,
    })
    if (failures.length > 0) throw new Error(`source bundle check failed:\n- ${failures.join('\n- ')}`)
    const tarVersion = run('tar', ['--version'])
    if (!tarVersion.includes('GNU tar')) {
      throw new Error('deterministic source archives require GNU tar; run this step on Linux')
    }
    run('tar', [
      '--sort=name',
      '--mtime=@0',
      '--owner=0',
      '--group=0',
      '--numeric-owner',
      '-cJf',
      archivePath,
      '-C',
      temporary,
      bundleName,
    ])
    const archiveSha256 = hashFile('sha256', archivePath)
    writeFileSync(`${archivePath}.sha256`, `${archiveSha256}  ${basename(archivePath)}\n`)
    console.log(`wrote ${archivePath}`)
    console.log(`SHA-256 ${archiveSha256}`)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
