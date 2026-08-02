const CALL_NAMES = new Set([
  'DeclareOption',
  'DeclareBoolOption',
  'DeclareStringOption',
  'DeclareComplementaryOption',
  'SetupKeyvalOptions',
  'ProcessKeyOptions',
  'define@key',
  'keys_define:nn',
  'DeclareKeys',
  'pgfkeys',
  'NewDocumentCommand',
  'RenewDocumentCommand',
  'ProvideDocumentCommand',
  'DeclareDocumentCommand',
  'NewDocumentEnvironment',
  'RenewDocumentEnvironment',
  'ProvideDocumentEnvironment',
  'DeclareDocumentEnvironment',
  'RequirePackage',
  'RequirePackageWithOptions',
  'usepackage',
  'LoadClass',
  'LoadClassWithOptions',
  'definecolor',
  'xdefinecolor',
  'providecolor',
  'colorlet',
  'definecolorset',
  'providecolorset',
  'preparecolorset',
  'DefineNamedColor',
])

function maskComments(source) {
  const chars = [...source]
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] !== '%') continue
    let slashes = 0
    for (let cursor = i - 1; cursor >= 0 && chars[cursor] === '\\'; cursor--) slashes++
    if (slashes % 2 === 1) continue
    while (i < chars.length && chars[i] !== '\n') chars[i++] = ' '
  }
  return chars.join('')
}

function skipSpace(text, offset) {
  let cursor = offset
  while (cursor < text.length && /\s/.test(text[cursor])) cursor++
  return cursor
}

function readGroup(text, offset) {
  const open = text[offset]
  const close = open === '{' ? '}' : open === '[' ? ']' : null
  if (!close) return null
  const stack = [close]
  for (let cursor = offset + 1; cursor < text.length; cursor++) {
    const char = text[cursor]
    if (char === '\\') {
      cursor++
      continue
    }
    if (char === '{') stack.push('}')
    else if (char === '[') stack.push(']')
    else if (char === stack.at(-1)) {
      stack.pop()
      if (stack.length === 0) {
        return {
          delimiter: open === '{' ? 'required' : 'optional',
          value: text.slice(offset + 1, cursor),
          start: offset,
          end: cursor + 1,
        }
      }
    }
  }
  return null
}

function lineNumber(text, offset) {
  let line = 1
  for (let cursor = 0; cursor < offset; cursor++) if (text[cursor] === '\n') line++
  return line
}

export function scanTexCalls(source) {
  const text = maskComments(source)
  const calls = []
  const command = /\\([A-Za-z@:_]+)(\*)?/g
  for (const match of text.matchAll(command)) {
    const name = match[1]
    if (!CALL_NAMES.has(name)) continue
    let cursor = skipSpace(text, match.index + match[0].length)
    const groups = []
    while (text[cursor] === '{' || text[cursor] === '[') {
      const group = readGroup(text, cursor)
      if (!group) break
      groups.push(group)
      cursor = skipSpace(text, group.end)
    }
    calls.push({ name, starred: match[2] === '*', groups, line: lineNumber(text, match.index) })
  }
  return calls
}

function splitTopLevel(value, separator = ',') {
  const parts = []
  const stack = []
  let start = 0
  for (let cursor = 0; cursor < value.length; cursor++) {
    const char = value[cursor]
    if (char === '\\') {
      cursor++
      continue
    }
    if (char === '{') stack.push('}')
    else if (char === '[') stack.push(']')
    else if (char === stack.at(-1)) stack.pop()
    else if (stack.length === 0 && char === separator) {
      parts.push(value.slice(start, cursor))
      start = cursor + 1
    }
  }
  parts.push(value.slice(start))
  return parts
}

function literalName(value) {
  const name = value.trim().replace(/^\/+|\/+$/g, '')
  if (!name || /[\\#{}]/.test(name)) return null
  return name.replaceAll(/\s+/g, ' ').replaceAll(/\s*\/\s*/g, '/')
}

function familyName(scopeName, raw) {
  const name = literalName(raw)
  if (!name) return null
  if (name === scopeName || name.startsWith(`${scopeName}/`)) return name
  return `${scopeName}/${name}`
}

function commandName(value) {
  return value.trim().match(/^\\([A-Za-z@]+)$/)?.[1] ?? null
}

function clistVariables(source) {
  const text = maskComments(source)
  const variables = new Map()
  const declaration = /\\clist_(?:const|g?set):Nn(?![A-Za-z@:_])/g
  for (const match of text.matchAll(declaration)) {
    let cursor = skipSpace(text, match.index + match[0].length)
    if (text[cursor] !== '\\') continue
    cursor++
    const start = cursor
    while (/[A-Za-z@:_]/.test(text[cursor] ?? '')) cursor++
    const name = text.slice(start, cursor)
    cursor = skipSpace(text, cursor)
    const group = text[cursor] === '{' ? readGroup(text, cursor) : null
    if (!name || !group) continue
    const values = splitTopLevel(group.value).map(literalName).filter(Boolean)
    if (values.length > 0) variables.set(name, values)
  }
  return variables
}

function provenance(sourcePath, line, extractor, evidence = 'declared') {
  return [{ evidence, sourcePath, line, extractor }]
}

function semanticKey(name, type, sourcePath, line, extractor, extra = {}) {
  return {
    name,
    value: { type, ...(extra.values ? { values: [...new Set(extra.values)].sort() } : {}) },
    repeatable: extra.repeatable ?? true,
    ...(extra.default !== undefined ? { default: extra.default } : {}),
    confidence: extra.confidence ?? 'exact',
    provenance: provenance(sourcePath, line, extractor, extra.evidence),
  }
}

function semanticColor(name, sourcePath, line, extractor, extra = {}) {
  return {
    name,
    kind: extra.kind ?? 'define',
    ...(extra.model ? { model: extra.model } : {}),
    ...(extra.value ? { value: extra.value } : {}),
    ...(extra.alias ? { alias: extra.alias } : {}),
    ...(extra.availability ? { availability: extra.availability } : {}),
    ...(extra.priority !== undefined ? { priority: extra.priority } : {}),
    confidence: extra.confidence ?? 'exact',
    provenance: provenance(sourcePath, line, extractor, extra.evidence),
  }
}

function addColor(colors, color) {
  if (!color) return
  const identity = `${color.name}\0${JSON.stringify(color.availability ?? null)}`
  const current = colors.get(identity)
  if (!current) {
    colors.set(identity, color)
    return
  }
  colors.set(identity, {
    ...current,
    ...color,
    provenance: [...current.provenance, ...color.provenance],
  })
}

function mergeKey(target, incoming) {
  const current = target.get(incoming.name)
  if (!current) {
    target.set(incoming.name, incoming)
    return incoming
  }
  current.provenance = [...current.provenance, ...incoming.provenance]
  if (incoming.value.type !== 'free-text' || current.value.type === 'free-text') {
    current.value = incoming.value
  }
  if (incoming.default !== undefined) current.default = incoming.default
  current.repeatable &&= incoming.repeatable
  return current
}

function ensureFamily(families, name) {
  let family = families.get(name)
  if (!family) {
    family = new Map()
    families.set(name, family)
  }
  return family
}

function addKey(families, family, key) {
  if (!family || !key) return null
  return mergeKey(ensureFamily(families, family), key)
}

function inferPropertyType(property) {
  if (/^(?:bool|choice|choices|is if)/.test(property)) return 'boolean'
  if (/^(?:int|fp)/.test(property)) return 'number'
  if (/^(?:dim|skip|muskip)/.test(property)) return 'dimension'
  if (/value_forbidden/.test(property)) return 'flag'
  return 'free-text'
}

function firstBraced(value) {
  const start = skipSpace(value, 0)
  return value[start] === '{' ? readGroup(value, start)?.value ?? null : null
}

function parseKeyDefinitions({
  definitions,
  family,
  families,
  sourcePath,
  line,
  extractor,
  unsupported,
  clists,
}) {
  const statements = splitTopLevel(definitions)
  for (const rawStatement of statements) {
    const statement = rawStatement.trim()
    if (!statement) continue
    const match = statement.match(
      /^(.+?)\s*\.([A-Za-z_ ]+)(?::([A-Za-z]*))?\s*(?:=\s*([\s\S]*))?$/,
    )
    if (!match) {
      unsupported.push({ line, construct: extractor, reason: 'unsupported key declaration' })
      continue
    }
    const rawKey = literalName(match[1])
    if (!rawKey) {
      unsupported.push({ line, construct: extractor, reason: 'dynamic key name' })
      continue
    }
    const property = match[2].trim()
    const signature = match[3] ?? ''
    const rhs = match[4]?.trim()

    const slash = rawKey.lastIndexOf('/')
    if (slash > 0 && /^(?:code|meta)/.test(property)) {
      const parentName = rawKey.slice(0, slash).trim()
      const choice = rawKey.slice(slash + 1).trim()
      const parent = ensureFamily(families, family).get(parentName)
      if (parent?.value.type === 'enum' && choice) {
        parent.value.values = [...new Set([...(parent.value.values ?? []), choice])].sort()
        continue
      }
    }

    if (/^(?:initial|default)/.test(property)) {
      const current = ensureFamily(families, family).get(rawKey)
      if (current && rhs !== undefined) current.default = rhs.replace(/^\{|\}$/g, '').trim()
      continue
    }

    let type = inferPropertyType(property)
    let values
    if (/^choice/.test(property)) type = 'enum'
    if (/^choices/.test(property)) {
      type = 'enum'
      const variable = rhs?.match(/^\\([A-Za-z@:_]+)/)?.[1]
      values = signature.startsWith('V') && variable
        ? clists.get(variable)
        : splitTopLevel(firstBraced(rhs ?? '') ?? '').map(literalName).filter(Boolean)
    }
    addKey(
      families,
      family,
      semanticKey(rawKey, type, sourcePath, line, extractor, {
        ...(values?.length ? { values } : {}),
      }),
    )
  }
}

function parseKeyValueOptions(value) {
  const result = new Map()
  for (const part of splitTopLevel(value)) {
    const equals = part.indexOf('=')
    if (equals < 0) continue
    const key = literalName(part.slice(0, equals))
    if (key) result.set(key, part.slice(equals + 1).trim().replace(/^\{|\}$/g, ''))
  }
  return result
}

function xparseArguments(spec) {
  const args = []
  for (let cursor = 0; cursor < spec.length; cursor++) {
    const token = spec[cursor]
    if (/\s/.test(token)) continue
    if (token === 'm' || token === 'r' || token === 'R') {
      args.push({ kind: 'required', valueKind: 'free-text' })
    } else if ('oOdDsteE'.includes(token)) {
      args.push({ kind: 'optional', valueKind: 'free-text' })
    }
    if ('ODRrtdE'.includes(token)) {
      while (cursor + 1 < spec.length && (spec[cursor + 1] === '{' || spec[cursor + 1] === '[')) {
        const group = readGroup(spec, cursor + 1)
        if (!group) break
        cursor = group.end - 1
      }
    }
  }
  return args
}

function parsePgfKeys({ definitions, scopeName, families, sourcePath, line }) {
  let currentFamily = `${scopeName}/pgfkeys`
  for (const rawStatement of splitTopLevel(definitions)) {
    const statement = rawStatement.trim()
    if (!statement) continue
    const cd = statement.match(/^(.+?)\/\.cd$/)
    if (cd) {
      currentFamily = familyName(scopeName, cd[1]) ?? currentFamily
      continue
    }
    const match = statement.match(/^(.+?)\/\.([A-Za-z ]+)(?:\s*=\s*([\s\S]*))?$/)
    if (!match) continue
    const rawKey = literalName(match[1])
    if (!rawKey) continue
    const property = match[2].trim()
    const rhs = match[3]?.trim()
    const slash = rawKey.lastIndexOf('/')
    if (slash > 0 && property === 'code') {
      const parentName = rawKey.slice(0, slash)
      const value = rawKey.slice(slash + 1)
      const parent = ensureFamily(families, currentFamily).get(parentName)
      if (parent?.value.type === 'enum') {
        parent.value.values = [...new Set([...(parent.value.values ?? []), value])].sort()
        continue
      }
    }
    if (property === 'initial') {
      const current = ensureFamily(families, currentFamily).get(rawKey)
      if (current && rhs !== undefined) current.default = rhs
      continue
    }
    const type = property === 'is choice' ? 'enum' : property === 'is if' ? 'boolean' : 'free-text'
    addKey(
      families,
      currentFamily,
      semanticKey(rawKey, type, sourcePath, line, 'pgfkeys'),
    )
  }
}

function callGroups(call, delimiter) {
  return call.groups.filter((group) => group.delimiter === delimiter)
}

function extractColorCall(call, required, colors, sourcePath) {
  if (call.name.endsWith('colorset')) {
    if (required.length < 4) return false
    const model = required[0].value.split('/')[0]?.trim()
    const prefix = required[1].value
    const suffix = required[2].value
    for (const entry of splitTopLevel(required[3].value, ';')) {
      const comma = entry.indexOf(',')
      if (comma < 0) continue
      const name = literalName(`${prefix}${entry.slice(0, comma).trim()}${suffix}`)
      const value = entry.slice(comma + 1).trim().split('/')[0]?.trim()
      if (name) {
        addColor(
          colors,
          semanticColor(name, sourcePath, call.line, call.name, {
            kind: call.name === 'providecolorset' ? 'provide' : 'define',
            model,
            value,
          }),
        )
      }
    }
    return true
  }
  if (call.name === 'DefineNamedColor') {
    const name = literalName(required[1]?.value ?? '')
    if (name && required.length >= 4) {
      addColor(
        colors,
        semanticColor(name, sourcePath, call.line, call.name, {
          model: required[2].value.trim(),
          value: required[3].value.trim(),
        }),
      )
    }
    return true
  }
  if (call.name === 'colorlet') {
    const name = literalName(required[0]?.value ?? '')
    const alias = required[1]?.value.trim()
    if (name && alias) {
      addColor(colors, semanticColor(name, sourcePath, call.line, call.name, { kind: 'alias', alias }))
    }
    return true
  }
  if (['definecolor', 'xdefinecolor', 'providecolor'].includes(call.name)) {
    const name = literalName(required[0]?.value ?? '')
    if (name && required.length >= 3) {
      addColor(
        colors,
        semanticColor(name, sourcePath, call.line, call.name, {
          kind: call.name === 'providecolor' ? 'provide' : 'define',
          model: required[1].value.trim(),
          value: required[2].value.trim(),
        }),
      )
    }
    return true
  }
  return false
}

export function extractTexSemantics({ source, sourcePath, scopeKind, scopeName }) {
  const calls = scanTexCalls(source)
  const clists = clistVariables(source)
  const families = new Map()
  const commands = new Map()
  const environments = new Map()
  const colors = new Map()
  const dependencies = new Set()
  const unsupported = []
  const loadFamily = `${scopeKind}-options`
  const setup = calls.find((call) => call.name === 'SetupKeyvalOptions')
  const setupOptions = setup?.groups[0] ? parseKeyValueOptions(setup.groups[0].value) : new Map()
  const kvFamily = familyName(scopeName, setupOptions.get('family') ?? scopeName)

  for (const call of calls) {
    const required = callGroups(call, 'required')
    const optional = callGroups(call, 'optional')
    if (extractColorCall(call, required, colors, sourcePath)) continue
    if (
      call.name === 'RequirePackage' ||
      call.name === 'RequirePackageWithOptions' ||
      call.name === 'usepackage' ||
      call.name === 'LoadClass' ||
      call.name === 'LoadClassWithOptions'
    ) {
      for (const dependency of splitTopLevel(required[0]?.value ?? '').map(literalName)) {
        if (dependency) dependencies.add(dependency)
      }
      continue
    }
    if (call.name === 'DeclareOption') {
      if (call.starred) {
        unsupported.push({ line: call.line, construct: 'DeclareOption*', reason: 'dynamic catch-all' })
        continue
      }
      const name = literalName(required[0]?.value ?? '')
      if (!name) {
        unsupported.push({ line: call.line, construct: call.name, reason: 'dynamic option name' })
        continue
      }
      addKey(
        families,
        loadFamily,
        semanticKey(name, 'flag', sourcePath, call.line, 'DeclareOption', {
          repeatable: false,
        }),
      )
      continue
    }
    if (call.name === 'DeclareBoolOption' || call.name === 'DeclareStringOption') {
      const name = literalName(required[0]?.value ?? '')
      if (!name) {
        unsupported.push({ line: call.line, construct: call.name, reason: 'dynamic option name' })
        continue
      }
      const type = call.name === 'DeclareBoolOption' ? 'boolean' : 'free-text'
      const key = name
        ? semanticKey(name, type, sourcePath, call.line, call.name, {
            repeatable: false,
            ...(optional[0] ? { default: optional[0].value.trim() } : {}),
          })
        : null
      addKey(families, loadFamily, key)
      addKey(families, kvFamily, key ? structuredClone(key) : null)
      continue
    }
    if (call.name === 'DeclareComplementaryOption') {
      const name = literalName(required[0]?.value ?? '')
      if (!name) {
        unsupported.push({ line: call.line, construct: call.name, reason: 'dynamic option name' })
        continue
      }
      const key = name
        ? semanticKey(name, 'flag', sourcePath, call.line, call.name, { repeatable: false })
        : null
      addKey(families, loadFamily, key)
      addKey(families, kvFamily, key ? structuredClone(key) : null)
      continue
    }
    if (call.name === 'define@key') {
      const family = familyName(scopeName, required[0]?.value ?? '')
      const name = literalName(required[1]?.value ?? '')
      const body = required[2]?.value ?? ''
      if (!family || !name) {
        unsupported.push({ line: call.line, construct: call.name, reason: 'dynamic family or key name' })
        continue
      }
      const type = /(?:true|false)/.test(body) ? 'boolean' : 'free-text'
      const key = name
        ? semanticKey(name, type, sourcePath, call.line, 'define@key', {
            ...(optional[0] ? { default: optional[0].value.trim() } : {}),
            ...(type === 'boolean' ? { confidence: 'inferred' } : {}),
          })
        : null
      if (key && type === 'boolean') {
        key.provenance.push({
          evidence: 'inferred',
          sourcePath,
          line: call.line,
          extractor: 'define@key-body-inference',
        })
      }
      addKey(
        families,
        family,
        key,
      )
      continue
    }
    if (call.name === 'keys_define:nn' || call.name === 'DeclareKeys') {
      const rawFamily =
        call.name === 'DeclareKeys'
          ? (optional[0]?.value ?? scopeName)
          : (required[0]?.value ?? '')
      const definitions =
        call.name === 'DeclareKeys' ? (required[0]?.value ?? '') : (required[1]?.value ?? '')
      const family = familyName(scopeName, rawFamily)
      if (!family) {
        unsupported.push({ line: call.line, construct: call.name, reason: 'dynamic key family' })
        continue
      }
      parseKeyDefinitions({
        definitions,
        family,
        families,
        sourcePath,
        line: call.line,
        extractor: call.name,
        unsupported,
        clists,
      })
      continue
    }
    if (call.name === 'ProcessKeyOptions') {
      const family = familyName(scopeName, optional[0]?.value ?? scopeName)
      const sourceFamily = family ? families.get(family) : null
      if (!sourceFamily) {
        unsupported.push({
          line: call.line,
          construct: call.name,
          reason: 'key family was not statically resolved',
        })
        continue
      }
      for (const key of sourceFamily.values()) {
        const loadKey = structuredClone(key)
        loadKey.repeatable = false
        addKey(families, loadFamily, loadKey)
      }
      continue
    }
    if (call.name === 'pgfkeys') {
      parsePgfKeys({
        definitions: required[0]?.value ?? '',
        scopeName,
        families,
        sourcePath,
        line: call.line,
      })
      continue
    }
    if (/DocumentCommand$/.test(call.name)) {
      const name = commandName(required[0]?.value ?? '')
      if (!name) {
        unsupported.push({ line: call.line, construct: call.name, reason: 'dynamic command name' })
        continue
      }
      commands.set(name, {
        name,
        args: xparseArguments(required[1]?.value ?? ''),
        confidence: 'exact',
        provenance: provenance(sourcePath, call.line, call.name),
      })
      continue
    }
    if (/DocumentEnvironment$/.test(call.name)) {
      const name = literalName(required[0]?.value ?? '')
      if (!name) {
        unsupported.push({
          line: call.line,
          construct: call.name,
          reason: 'dynamic environment name',
        })
        continue
      }
      environments.set(name, {
        name,
        args: xparseArguments(required[1]?.value ?? ''),
        confidence: 'exact',
        provenance: provenance(sourcePath, call.line, call.name),
      })
    }
  }

  for (const [family, keys] of families) {
    for (const key of keys.values()) {
      if (key.value.type !== 'enum' || (key.value.values?.length ?? 0) > 0) continue
      key.value = { type: 'free-text' }
      key.confidence = 'inferred'
      const declaration = key.provenance[0]
      key.provenance.push({
        evidence: 'inferred',
        sourcePath,
        line: declaration?.line ?? 1,
        extractor: 'unresolved-choice-values',
      })
      unsupported.push({
        line: declaration?.line ?? 1,
        construct: `${family}/${key.name}`,
        reason: 'choice values were not statically resolved',
      })
    }
  }

  return {
    keyFamilies: [...families]
      .map(([name, keys]) => ({ name, keys: [...keys.values()].sort((a, b) => a.name.localeCompare(b.name)) }))
      .filter((family) => family.keys.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name)),
    commands: [...commands.values()].sort((a, b) => a.name.localeCompare(b.name)),
    environments: [...environments.values()].sort((a, b) => a.name.localeCompare(b.name)),
    colors: [...colors.values()].sort(
      (a, b) => a.name.localeCompare(b.name) || (a.priority ?? 0) - (b.priority ?? 0),
    ),
    dependencies: [...dependencies].sort(),
    unsupported,
  }
}

export function mergeSemanticMetadata(base, addition, provenanceDefaults = null) {
  const families = new Map(
    base.keyFamilies.map((family) => [
      family.name,
      new Map(family.keys.map((key) => [key.name, structuredClone(key)])),
    ]),
  )
  for (const family of addition?.keyFamilies ?? []) {
    const name = literalName(family.name)
    if (!name) continue
    for (const rawKey of family.keys ?? []) {
      const keyName = literalName(rawKey.name)
      if (!keyName || !rawKey.value?.type) continue
      const key = structuredClone(rawKey)
      key.name = keyName
      key.repeatable ??= true
      key.confidence ??= provenanceDefaults?.confidence ?? 'overridden'
      key.provenance = [
        ...(key.provenance ?? []),
        ...(provenanceDefaults ? [provenanceDefaults.provenance] : []),
      ]
      addKey(families, name, key)
    }
  }

  const mergeNamed = (left, right) => {
    const values = new Map(left.map((value) => [value.name, structuredClone(value)]))
    for (const raw of right ?? []) {
      const name = literalName(raw.name)
      if (!name) continue
      const current = values.get(name)
      const value = structuredClone(raw)
      value.name = name
      value.args ??= []
      value.confidence ??= provenanceDefaults?.confidence ?? 'overridden'
      value.provenance = [
        ...(current?.provenance ?? []),
        ...(value.provenance ?? []),
        ...(provenanceDefaults ? [provenanceDefaults.provenance] : []),
      ]
      values.set(name, value)
    }
    return [...values.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  const colors = new Map(
    (base.colors ?? []).map((color) => [
      `${color.name}\0${JSON.stringify(color.availability ?? null)}`,
      structuredClone(color),
    ]),
  )
  for (const raw of addition?.colors ?? []) {
    const name = literalName(raw.name)
    if (!name) continue
    const color = structuredClone(raw)
    color.name = name
    color.kind ??= 'define'
    color.confidence ??= provenanceDefaults?.confidence ?? 'overridden'
    color.provenance = [
      ...(color.provenance ?? []),
      ...(provenanceDefaults ? [provenanceDefaults.provenance] : []),
    ]
    addColor(colors, color)
  }

  return {
    keyFamilies: [...families]
      .map(([name, keys]) => ({ name, keys: [...keys.values()].sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    commands: mergeNamed(base.commands, addition?.commands),
    environments: mergeNamed(base.environments, addition?.environments),
    colors: [...colors.values()].sort(
      (a, b) => a.name.localeCompare(b.name) || (a.priority ?? 0) - (b.priority ?? 0),
    ),
    dependencies: [...new Set([...(base.dependencies ?? []), ...(addition?.dependencies ?? [])])].sort(),
    unsupported: [...base.unsupported, ...(addition?.unsupported ?? [])],
  }
}
