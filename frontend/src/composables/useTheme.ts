import { ref } from 'vue'
import {
  loadPreference,
  savePreference,
  migratePreferencesIntoUser,
} from './preferenceStorage'
// 刻意用相对路径而不是 '@/config/themePresets'：本文件被 stores/auth.ts 与
// main.ts 引用，也可能被 node 测试直接 import，而 `tsx --test` 不解析 @/ 别名
// （paths 只声明在 tsconfig.app.json，tsx 读的是根 tsconfig.json）。
// 同理 preferenceStorage 也是相对引入的。
import {
  THEME_SKIN_ATTR,
  resolveThemeSkin,
  resolveThemeSurface,
  themePresetNativeBg,
  type ThemeMode,
  type ThemeSkin,
  type ThemeSurface,
} from '../config/themePresets'

export type { ThemeMode }

const THEME_KEY = 'theme'

function loadTheme(): ThemeMode {
  const v = loadPreference(THEME_KEY)
  if (v === 'light' || v === 'dark' || v === 'system' || v === 'punk') return v
  return 'light'
}

// Shared reactive state across all consumers
const currentTheme = ref<ThemeMode>(loadTheme())

// 缓存键必须同时包含极性与皮肤：深色与朋克的极性都是 dark，
// 只比较极性会让 dark → punk 的切换被短路，皮肤属性写不进去。
let lastEffective: string | null = null

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** '#0b0b0e' → { r: 11, g: 11, b: 14 }，供 Wails 原生窗口底色使用 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

/** Wails：与原生窗口底色 / 系统深浅色一致，减轻 Ctrl+R 整窗白闪（浅色与 --td-bg-color-page #eee 对齐） */
function syncWailsNativeChrome(surface: ThemeSurface, skin: ThemeSkin) {
  // 定制皮肤自带底色，优先使用；否则回落到上游浅/深底色。
  const presetBg = skin === 'punk' ? themePresetNativeBg('punk') : null
  const bg = presetBg || (surface === 'dark' ? '#181818' : '#eeeeee')
  document.documentElement.style.background = bg
  document.documentElement.style.minHeight = '100%'
  document.documentElement.style.colorScheme = surface === 'dark' ? 'dark' : 'light'
  if (document.body) {
    document.body.style.background = bg
    document.body.style.minHeight = '100%'
  }
  const appEl = document.getElementById('app')
  if (appEl) {
    appEl.style.background = bg
    appEl.style.minHeight = '100%'
  }
  const w = (window as unknown as {
    runtime?: {
      WindowSetDarkTheme?: () => void
      WindowSetLightTheme?: () => void
      WindowSetBackgroundColour?: (r: number, g: number, b: number, a: number) => void
    }
  }).runtime
  if (!w?.WindowSetBackgroundColour) return
  try {
    if (surface === 'dark') {
      w.WindowSetDarkTheme?.()
    } else {
      w.WindowSetLightTheme?.()
    }
    const rgb = hexToRgb(bg)
    if (rgb) {
      w.WindowSetBackgroundColour(rgb.r, rgb.g, rgb.b, 255)
    }
  } catch {
    /* 非桌面壳或未注入 runtime */
  }
}

function applyTheme(mode: ThemeMode) {
  // 皮肤与极性正交：朋克是深色表面的定制皮肤。
  const systemPrefersDark = mode === 'system' && getSystemTheme() === 'dark'
  const surface = resolveThemeSurface(mode, systemPrefersDark)
  const skin = resolveThemeSkin(mode)
  const key = `${surface}:${skin}`
  if (lastEffective === key) return
  lastEffective = key
  const root = document.documentElement
  root.setAttribute('theme-mode', surface)
  root.setAttribute(THEME_SKIN_ATTR, skin)
  syncWailsNativeChrome(surface, skin)
}

export function useTheme() {
  function setTheme(mode: ThemeMode): boolean {
    if (mode !== 'light' && mode !== 'dark' && mode !== 'system' && mode !== 'punk') return false
    currentTheme.value = mode
    savePreference(THEME_KEY, mode)
    applyTheme(mode)
    return true
  }

  return { currentTheme, setTheme }
}

/** Call once in main.ts to initialise theme and listen for OS changes. */
export function initTheme() {
  currentTheme.value = loadTheme()
  applyTheme(currentTheme.value)

  // React to OS theme changes when user chose "system"
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (currentTheme.value === 'system') {
      applyTheme('system')
    }
  })
}

/** Re-read preferences from storage (call after login / logout). */
export function reloadThemeFromStorage() {
  migratePreferencesIntoUser()
  currentTheme.value = loadTheme()
  applyTheme(currentTheme.value)
}
