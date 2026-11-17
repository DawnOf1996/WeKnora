/**
 * 主题预设 —— 定制主题（朋克）的规则唯一来源。
 *
 * 与 config/branding.ts 遵循同一套约束（上游 WeKnora 升级时必须保持）：
 *  1. 本文件只放「规则」，不放「实现」。样式实现在 assets/theme/punk-theme.css，
 *     规则与实现分离：调文案/底色只动本文件，调配色只动 CSS。
 *  2. 上游升级时本文件不与上游产生冲突。回退方式见本文件末尾的「回退」注释。
 *  3. 新增主题时在此追加一项，并同步新增对应的 CSS 变量块与下拉选项。
 *
 * 为什么不用 i18n：朋克是定制主题，不是上游语言包的一部分。把它放进 6 个上游
 * locale 文件意味着每次上游升级都要重新合并 6 处；而这里只需要维护一处。
 * 上游若日后原生支持主题预设，再迁移到 i18n 也不迟。
 *
 * 基于 Tencent WeKnora (MIT License) 修改，保留原版权声明与许可声明。
 */

/**
 * 皮肤标记在 <html> 上的属性名。
 *
 * 刻意不用 `data-theme`：该名属于 TDesign 生态的通用约定，上游随时可能占用，
 * 一旦撞名，朋克皮肤会被上游的取值静默覆盖。独立属性名不与任何人抢。
 */
export const THEME_SKIN_ATTR = 'data-theme-skin'

/** 明暗极性 —— <html theme-mode> 的取值。 */
export type ThemeSurface = 'light' | 'dark'

/** 皮肤 —— <html data-theme-skin> 的取值。 */
export type ThemeSkin = 'default' | 'punk'

/** 主题模式 —— 用户在设置里可选的值。 */
export type ThemeMode = 'light' | 'dark' | 'system' | 'punk'

export interface ThemePreset {
  /** 下拉选项显示名，按 locale 索引；未登记的 locale 回落到 en-US */
  label: Record<string, string>
  /** 原生窗口底色（Wails），须与 CSS 中 --td-bg-color-page 保持一致 */
  nativeBg: string
  /** 页面底色，供原生窗口与首屏引导脚本对齐 */
  pageBg: string
}

/** 定制主题预设。key 即 ThemeMode 中的自定义模式。 */
export const THEME_PRESETS = {
  punk: {
    // 显式标注为 Record<string, string>：否则 satisfies 会保留字面量窄类型，
    // 用任意 locale 索引时 TS 报「无索引签名」。
    label: {
      'zh-CN': '朋克',
      'zh-TW': '龐克',
      'en-US': 'Punk',
      'ru-RU': 'Панк',
      'ko-KR': '펑크',
      'ja-JP': 'パンク',
    } as Record<string, string>,
    nativeBg: '#0b0b0e',
    pageBg: '#0b0b0e',
  },
} satisfies Record<string, ThemePreset>

/** 自定义预设的 key 联合类型 */
export type ThemePresetKey = keyof typeof THEME_PRESETS

/** 是否为自定义（上游之外）的主题模式 */
export function isThemePreset(mode: string): mode is ThemePresetKey {
  return Object.prototype.hasOwnProperty.call(THEME_PRESETS, mode)
}

/**
 * 主题模式 → 明暗极性。
 *
 * 朋克是深色表面，因此落在 dark；system 跟随系统偏好。
 */
export function resolveThemeSurface(mode: ThemeMode, systemPrefersDark: boolean): ThemeSurface {
  if (mode === 'system') return systemPrefersDark ? 'dark' : 'light'
  if (mode === 'punk') return 'dark'
  return mode
}

/**
 * 主题模式 → 皮肤。
 *
 * 皮肤与极性正交：普通模式一律使用 default 皮肤。
 * 将来若要「朋克浅色」，只需再引入一个皮肤值，不必改极性逻辑。
 */
export function resolveThemeSkin(mode: ThemeMode): ThemeSkin {
  return mode === 'punk' ? 'punk' : 'default'
}

/** 取自定义主题的本地化显示名；非自定义主题原样返回 mode。 */
export function themePresetLabel(mode: string, locale: string): string {
  if (!isThemePreset(mode)) return mode
  const preset = THEME_PRESETS[mode]
  return preset.label[locale] || preset.label['en-US'] || mode
}

/** 取自定义主题的原生窗口底色；非自定义主题返回 null（走默认浅/深底色）。 */
export function themePresetNativeBg(mode: string): string | null {
  if (!isThemePreset(mode)) return null
  return THEME_PRESETS[mode].nativeBg
}

/**
 * 回退（放弃某个定制主题、保留机制）：
 *   1. 从 THEME_PRESETS 里删掉对应项
 *   2. assets/theme/<skin>.css 删除或清空
 *   3. main.ts 移除对应的 import
 *   其余调用点（useTheme.ts / GeneralSettings.vue / SandboxTerminal.vue /
 *   useDocumentPictureInPicture.ts / index.html）无需改动 ——
 *   它们只消费本文件导出的函数与类型，没有硬编码具体主题名。
 */
