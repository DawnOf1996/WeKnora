import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN.ts'
import ruRU from './locales/ru-RU.ts'
import enUS from './locales/en-US.ts'
import koKR from './locales/ko-KR.ts'
import jaJP from './locales/ja-JP.ts'
import zhTW from './locales/zh-TW.ts'
import { BUILT_IN_DEFAULT, resolveDefaultLocale } from './resolveDefaultLocale.ts'
import { pluralRules } from './pluralizationRules.ts'
import { buildBrandMessages } from './brandMessages.ts'
import { BRAND, brandName } from '@/config/branding'

/**
 * 品牌覆盖层合并：按点分路径深合并，brandMessages 的条目覆盖上游 locale。
 *
 * 上游 locales/*.ts 保持原样 —— 上游每次发版都会改这些文件，在里面改字符串
 * 等于制造冲突点。本文件（独立新增）与 brandMessages.ts（独立新增）都不与
 * 上游重叠，升级时零冲突。
 */
function mergeBrandMessages<T extends Record<string, unknown>>(
  base: T,
  patch: Record<string, string>,
): T {
  const out: Record<string, unknown> = { ...base }
  for (const [path, value] of Object.entries(patch)) {
    const segments = path.split('.')
    let cursor = out
    for (let i = 0; i < segments.length - 1; i += 1) {
      const seg = segments[i]!
      const next = cursor[seg]
      if (typeof next !== 'object' || next === null || Array.isArray(next)) {
        cursor[seg] = {}
      }
      cursor = cursor[seg] as Record<string, unknown>
    }
    const leaf = segments[segments.length - 1]!
    cursor[leaf] = value
  }
  return out as T
}

function withBrand<T extends Record<string, unknown>>(base: T, locale: string): T {
  return mergeBrandMessages(
    base,
    buildBrandMessages(locale, brandName(locale), BRAND.assistantName),
  )
}

const messages = {
  'zh-CN': withBrand(zhCN, 'zh-CN'),
  'zh-TW': withBrand(zhTW, 'zh-TW'),
  'en-US': withBrand(enUS, 'en-US'),
  'ru-RU': withBrand(ruRU, 'ru-RU'),
  'ko-KR': withBrand(koKR, 'ko-KR'),
  'ja-JP': withBrand(jaJP, 'ja-JP')
}

// User's explicit past choice wins; otherwise use the deployment default.
const savedLocale = localStorage.getItem('locale') || resolveDefaultLocale(
  window.__RUNTIME_CONFIG__?.DEFAULT_LOCALE,
  import.meta.env.VITE_DEFAULT_LOCALE,
)

const i18n = createI18n({
  legacy: false,
  locale: savedLocale,
  fallbackLocale: BUILT_IN_DEFAULT,
  globalInjection: true,
  pluralRules,
  // Some translations intentionally embed `<strong>` markup (e.g. agent step summaries).
  // We render them via v-html with our own sanitization, so silence vue-i18n's HTML warning
  // to avoid flooding the console and slowing renders during history loads.
  warnHtmlMessage: false,
  messages
})

export default i18n
