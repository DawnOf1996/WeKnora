import assert from 'node:assert/strict'
import test from 'node:test'

import {
  THEME_PRESETS,
  THEME_SKIN_ATTR,
  isThemePreset,
  resolveThemeSkin,
  resolveThemeSurface,
  themePresetLabel,
  themePresetNativeBg,
} from './themePresets.ts'

test('theme skin attribute name is dedicated and unlikely to collide upstream', () => {
  // 不能用 data-theme：那是 TDesign 生态的通用约定，上游随时可能占用。
  assert.equal(THEME_SKIN_ATTR, 'data-theme-skin')
})

test('theme surface resolution keeps light and dark intact', () => {
  assert.equal(resolveThemeSurface('light', false), 'light')
  assert.equal(resolveThemeSurface('light', true), 'light')
  assert.equal(resolveThemeSurface('dark', false), 'dark')
  assert.equal(resolveThemeSurface('dark', true), 'dark')
})

test('theme surface resolution follows the system preference for "system"', () => {
  assert.equal(resolveThemeSurface('system', true), 'dark')
  assert.equal(resolveThemeSurface('system', false), 'light')
})

test('punk is a dark surface regardless of the system preference', () => {
  assert.equal(resolveThemeSurface('punk', false), 'dark')
  assert.equal(resolveThemeSurface('punk', true), 'dark')
})

test('skin resolution is orthogonal to the surface', () => {
  assert.equal(resolveThemeSkin('punk'), 'punk')
  assert.equal(resolveThemeSkin('dark'), 'default')
  assert.equal(resolveThemeSkin('light'), 'default')
  assert.equal(resolveThemeSkin('system'), 'default')
})

test('skin and surface stay distinguishable so dark -> punk is not short-circuited', () => {
  // 深色与朋克的极性相同，皮肤不同；applyTheme 的缓存键必须能区分二者。
  assert.equal(resolveThemeSurface('dark', false), resolveThemeSurface('punk', false))
  assert.notEqual(resolveThemeSkin('dark'), resolveThemeSkin('punk'))
})

test('preset labels are localized and fall back to en-US', () => {
  assert.equal(themePresetLabel('punk', 'zh-CN'), '朋克')
  assert.equal(themePresetLabel('punk', 'zh-TW'), '龐克')
  assert.equal(themePresetLabel('punk', 'en-US'), 'Punk')
  assert.equal(themePresetLabel('punk', 'ru-RU'), 'Панк')
  assert.equal(themePresetLabel('punk', 'ko-KR'), '펑크')
  assert.equal(themePresetLabel('punk', 'ja-JP'), 'パンク')
  assert.equal(themePresetLabel('punk', 'xx-XX'), 'Punk')
})

test('non-preset modes are returned untouched', () => {
  assert.equal(themePresetLabel('light', 'zh-CN'), 'light')
  assert.equal(themePresetLabel('dark', 'zh-CN'), 'dark')
  assert.equal(themePresetLabel('system', 'zh-CN'), 'system')
  assert.equal(themePresetNativeBg('light'), null)
  assert.equal(themePresetNativeBg('dark'), null)
})

test('preset detection only accepts registered presets', () => {
  assert.equal(isThemePreset('punk'), true)
  assert.equal(isThemePreset('light'), false)
  assert.equal(isThemePreset('__proto__'), false)
  assert.equal(isThemePreset('constructor'), false)
})

test('punk native background matches the CSS page background', () => {
  // 须与 assets/theme/punk-theme.css 中 --td-gray-color-14 一致，
  // 否则原生窗口边缘会露出不同色带。
  assert.equal(THEME_PRESETS.punk.nativeBg, '#0b0b0e')
  assert.equal(themePresetNativeBg('punk'), THEME_PRESETS.punk.nativeBg)
  assert.equal(themePresetNativeBg('punk'), THEME_PRESETS.punk.pageBg)
})
