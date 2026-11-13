import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BRAND,
  brandLogo,
  isHiddenIntegrationTab,
  isHiddenSettingsSection,
  isHiddenUserMenuItem,
} from './branding.ts'

test('branding hide lists cover the intended settings sections', () => {
  assert.equal(isHiddenSettingsSection('ollama'), true)
  assert.equal(isHiddenSettingsSection('weknoracloud'), true)
  assert.equal(isHiddenSettingsSection('models'), false)
  assert.equal(isHiddenSettingsSection('general'), false)
  assert.equal(isHiddenSettingsSection('websearch'), false)
})

test('branding hide lists cover the intended integration tabs', () => {
  for (const key of ['im', 'cli', 'chrome', 'claw']) {
    assert.equal(isHiddenIntegrationTab(key), true, `${key} should be hidden`)
  }
  for (const key of ['embed', 'api', 'mcpserver']) {
    assert.equal(isHiddenIntegrationTab(key), false, `${key} should stay visible`)
  }
})

test('branding hide lists cover the intended user menu entries', () => {
  assert.equal(isHiddenUserMenuItem('docs'), true)
  assert.equal(isHiddenUserMenuItem('github'), true)
  assert.equal(isHiddenUserMenuItem('settings'), false)
  assert.equal(isHiddenUserMenuItem('members'), false)
})

test('brand logo falls back to the upstream asset when no custom logo is set', () => {
  assert.equal(brandLogo('/upstream.png'), BRAND.logo || '/upstream.png')
})
