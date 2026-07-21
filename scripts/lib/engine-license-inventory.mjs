import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SHA40 = /^[a-f0-9]{40}$/i

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

export function validateEngineLicenseInventory(inventory, linkInventory, root) {
  assert(inventory?.schemaVersion === 1, 'engine component inventory schemaVersion must be 1')
  assert(SHA40.test(inventory.texliveSourceCommit ?? ''), 'invalid TeX Live source commit')
  assert(
    SHA40.test(inventory.linkInventorySourceRevision ?? ''),
    'invalid link inventory source revision',
  )
  assert(
    inventory.linkInventorySourceRevision === linkInventory?.sourceRevision,
    'component inventory and link inventory source revisions differ',
  )

  const familyNames = new Set()
  for (const entry of inventory.families ?? []) {
    assert(typeof entry?.family === 'string' && !familyNames.has(entry.family), 'invalid family')
    familyNames.add(entry.family)
    assert(typeof entry.combinedLicense === 'string' && entry.combinedLicense, `${entry.family}: missing combined license`)
    assert(typeof entry.reason === 'string' && entry.reason, `${entry.family}: missing license reason`)
  }

  const linkedFamilies = new Set((linkInventory?.maps ?? []).map((entry) => entry.family))
  assert(
    JSON.stringify([...familyNames].sort()) === JSON.stringify([...linkedFamilies].sort()),
    'component inventory families do not exactly match the link inventory',
  )

  const componentIds = new Set()
  const compiled = []
  for (const component of inventory.components ?? []) {
    assert(
      typeof component?.id === 'string' && component.id && !componentIds.has(component.id),
      `invalid or duplicate component id: ${String(component?.id)}`,
    )
    componentIds.add(component.id)
    assert(typeof component.version === 'string' && component.version, `${component.id}: missing version`)
    assert(
      typeof component.licenseExpression === 'string' && component.licenseExpression,
      `${component.id}: missing license expression`,
    )
    assert(
      Array.isArray(component.archivePatterns) && component.archivePatterns.length > 0,
      `${component.id}: missing archive patterns`,
    )
    assert(
      Array.isArray(component.noticeFiles) && component.noticeFiles.length > 0,
      `${component.id}: missing notice files`,
    )
    assert(
      Array.isArray(component.sourceNoticePaths) && component.sourceNoticePaths.length > 0,
      `${component.id}: missing source notice paths`,
    )
    for (const notice of component.noticeFiles) {
      assert(existsSync(resolve(root, notice)), `${component.id}: missing notice file ${notice}`)
    }
    if (component.licenseExpression.startsWith('LGPL-')) {
      assert(
        component.staticLinking?.method === 'complete-source-relink',
        `${component.id}: statically linked LGPL component has no relink method`,
      )
      assert(
        component.staticLinking.instructions === 'RELINK.md',
        `${component.id}: relink instructions must be RELINK.md`,
      )
      assert(
        Array.isArray(component.staticLinking.families) &&
          component.staticLinking.families.length > 0,
        `${component.id}: relink families are missing`,
      )
    }
    for (const pattern of component.archivePatterns) {
      compiled.push({ component, pattern, regex: new RegExp(pattern) })
    }
  }

  const usedPatterns = new Set()
  const coverage = []
  for (const map of linkInventory.maps ?? []) {
    for (const archive of map.archives ?? []) {
      const matches = compiled.filter((entry) => entry.regex.test(archive.path))
      assert(
        matches.length === 1,
        `${map.family}:${archive.path} matched ${matches.length} component inventory entries`,
      )
      usedPatterns.add(matches[0].pattern)
      coverage.push({ family: map.family, archive: archive.path, component: matches[0].component.id })
      const relinkFamilies = matches[0].component.staticLinking?.families
      if (relinkFamilies) {
        assert(
          relinkFamilies.includes(map.family),
          `${matches[0].component.id}: missing relink family ${map.family}`,
        )
      }
    }
  }
  for (const entry of compiled) {
    assert(usedPatterns.has(entry.pattern), `${entry.component.id}: unused archive pattern ${entry.pattern}`)
  }

  assert(
    inventory.components.find((entry) => entry.id === 'xpdf')?.licenseExpression ===
      'GPL-2.0-only',
    'Xpdf 4.04 must use the GPL-2.0-only selection for this release',
  )
  assert(
    inventory.components.find((entry) => entry.id === 'freetype-port')?.licenseExpression ===
      'GPL-2.0-only',
    'FreeType must use its GPL-2.0-only option in the GPLv2 XeTeX unit',
  )

  return coverage
}

export function loadAndValidateEngineLicenseInventory(root, inventoryPath) {
  const inventory = JSON.parse(readFileSync(resolve(root, inventoryPath), 'utf8'))
  const linkInventory = JSON.parse(readFileSync(resolve(root, inventory.linkInventory), 'utf8'))
  return {
    inventory,
    linkInventory,
    coverage: validateEngineLicenseInventory(inventory, linkInventory, root),
  }
}
