#!/usr/bin/env node
/** Match declaration imports to the ESM paths in the preserveModules JS graph. */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const lib = fileURLToPath(new URL('../lib/', import.meta.url))
for (const relative of readdirSync(lib, { recursive: true })) {
  if (!relative.endsWith('.d.ts')) continue
  const file = join(lib, relative)
  let content = readFileSync(file, 'utf8')
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true)
  const edits = []
  function visit(node) {
    const specifier =
      ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
        ? node.moduleSpecifier
        : ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
          ? node.argument.literal
          : undefined
    if (specifier && ts.isStringLiteral(specifier) && /^\.\.?\//.test(specifier.text)) {
      const path = specifier.text
      if (!/\.(?:[cm]?js|json|css)$/.test(path)) {
        const target = join(dirname(file), path)
        const suffix = existsSync(`${target}.d.ts`)
          ? '.js'
          : existsSync(join(target, 'index.d.ts'))
            ? '/index.js'
            : null
        if (!suffix) throw new Error(`Unresolved declaration import ${path} in ${relative}`)
        // Edit only the parsed module string; preserve comments and declaration layout.
        edits.push({
          start: specifier.getStart(source) + 1,
          end: specifier.end - 1,
          value: path + suffix,
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    content = content.slice(0, edit.start) + edit.value + content.slice(edit.end)
  }
  if (edits.length) writeFileSync(file, content)
}
console.log('declaration module specifiers use resolvable ESM paths')
