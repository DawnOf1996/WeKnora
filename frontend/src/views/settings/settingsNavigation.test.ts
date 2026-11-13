import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { computed } from 'vue'
import { INTEGRATION_PREVIEW_ITEMS } from '../../config/integrations'
import { integrationSectionKey } from '../../config/settingsRoute'

// Exercise the actual sidebar grouping without mounting the settings panels.
const source = readFileSync(new URL('./Settings.vue', import.meta.url), 'utf8')
const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1]!
const ast = ts.createSourceFile('Settings.ts', script, ts.ScriptTarget.Latest, true)
const grouping = ast.statements.find((statement) =>
  ts.isVariableStatement(statement) && statement.declarationList.declarations.some(
    (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === 'navGroups',
  ),
)
assert.ok(grouping, 'Settings must define sidebar groups')
const compiled = ts.transpileModule(grouping.getText(ast), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText

function integrationMenu(visibleKeys: string[]): string[] {
  const groups = runInNewContext(`${compiled}\nnavGroups.value`, {
    computed,
    navItems: { value: visibleKeys.map((key) => ({ key })) },
    t: (key: string) => key,
    integrationSectionKey,
    INTEGRATION_PREVIEW_ITEMS,
  }) as Array<{ key: string; items: Array<{ key: string }> }>
  const integrationGroup = groups.find((group) => group.key === 'integrations')
  return Array.from(integrationGroup?.items ?? [], (item) => item.key)
}

const integrationKeys = INTEGRATION_PREVIEW_ITEMS.map((item) => integrationSectionKey(item.key))

// The branding hide list is applied when navItems is built, before navGroups
// groups it. These two cases cover the grouping mechanism itself: given a set
// of already-visible items, the integrations group keeps them in nav order.
test('settings sidebar groups every visible integration in navigation order', () => {
  assert.deepEqual(integrationMenu(['general', ...integrationKeys]), integrationKeys)
})

test('settings sidebar preserves visibility filtering for integrations', () => {
  const visible = integrationKeys.filter((key) => key !== 'integration-api' && key !== 'integration-im')
  assert.deepEqual(integrationMenu(visible), visible)
  assert.deepEqual(integrationMenu(['general']), [])
})

// Guard against the silent failure mode: an upstream refactor of navItems
// could drop the branding filter, which would make every hidden entry reappear
// while type-check, build and the tests above still pass.
test('settings navigation applies the branding hide list when building navItems', () => {
  const navItemsStatement = ast.statements.find((statement) =>
    ts.isVariableStatement(statement) && statement.declarationList.declarations.some(
      (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === 'navItems',
    ),
  )
  assert.ok(navItemsStatement, 'Settings must define navItems')
  const navItemsText = navItemsStatement.getText(ast)
  assert.ok(
    navItemsText.includes('isHiddenIntegrationTab'),
    'navItems must filter integration tabs through config/branding.ts',
  )
  assert.ok(
    navItemsText.includes('isHiddenSettingsSection'),
    'navItems must filter settings sections through config/branding.ts',
  )
})

// Keep navigation tests tied to the real close handler, without mounting
// settings panels that require backend services.
const closeHandler = ast.statements.find((statement) =>
  ts.isVariableStatement(statement) && statement.declarationList.declarations.some(
    (declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === 'handleClose',
  ),
)
assert.ok(closeHandler, 'Settings must define a close handler')
const compiledClose = ts.transpileModule(closeHandler.getText(ast), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText

function closeSettings(back: unknown, section = 'members', path = '/platform/settings'): string[] {
  const actions: string[] = []
  class FocusedElement {
    blur() { actions.push('blur') }
  }
  runInNewContext(`${compiledClose}\nhandleClose()`, {
    document: { activeElement: new FocusedElement() },
    HTMLElement: FocusedElement,
    route: { path, query: { section } },
    uiStore: { closeSettings: () => actions.push('close') },
    router: {
      options: { history: { state: { back } } },
      push: (target: string) => actions.push(`push:${target}`),
      back: () => actions.push('back'),
    },
  })
  return actions
}

test('closing a directly opened settings route stays in the application', () => {
  for (const back of [null, undefined, '', 'https://example.com/', '//example.com/', '/login']) {
    assert.deepEqual(closeSettings(back), ['blur', 'close', 'push:/platform/knowledge-bases'])
  }
})

test('closing settings preserves a known in-app previous route', () => {
  for (const back of ['/platform/knowledge-bases', '/platform/chat/session-123']) {
    assert.deepEqual(closeSettings(back), ['blur', 'close', 'back'])
  }
})

test('closing system settings retains its explicit knowledge-base destination', () => {
  for (const section of ['model-catalog', 'system-global', 'runtime-queues', 'platform-api-keys', 'system-audit-log']) {
    assert.deepEqual(closeSettings('/platform/chat/session-123', section), [
      'blur', 'close', 'push:/platform/knowledge-bases',
    ])
  }
})

test('closing an overlaid settings panel leaves the underlying route alone', () => {
  assert.deepEqual(closeSettings(null, 'general', '/platform/chat/session-123'), ['blur', 'close'])
})
