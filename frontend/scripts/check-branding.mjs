#!/usr/bin/env node
/**
 * 品牌定制漂移检测 —— 上游 WeKnora 升级后必跑。
 *
 * 为什么需要它：上游重构代码时可能删掉我们的过滤调用，此时
 * `npm test` / `type-check` / `build` 全部通过，但隐藏功能已经
 * 静默失效（菜单项重新出现）。本脚本专门盯这一类问题。
 *
 * 用法：npm run check-branding
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => {
  try {
    return readFileSync(join(root, relativePath), 'utf8')
  } catch {
    return null
  }
}

const problems = []
const fail = (msg) => problems.push(msg)

// ── 1 & 2：集成项黑名单与上游集成项的一致性 ──────────────────────────
const integrationsSrc = read('src/config/integrations.ts')
const brandingSrc = read('src/config/branding.ts')

if (!integrationsSrc) {
  fail('✗ 找不到 src/config/integrations.ts —— 上游可能重构了集成项注册表')
} else if (!brandingSrc) {
  fail('✗ 找不到 src/config/branding.ts —— 品牌定制配置丢失')
} else {
  const upstreamTabs = [...integrationsSrc.matchAll(/key:\s*'(\w+)'/g)].map((m) => m[1])
  const hiddenBlock = brandingSrc.match(/HIDDEN_INTEGRATION_TABS\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? ''
  const hiddenTabs = [...hiddenBlock.matchAll(/'(\w+)'/g)].map((m) => m[1])

  for (const tab of hiddenTabs) {
    if (!upstreamTabs.includes(tab)) {
      fail(`✗ 黑名单中的集成项 "${tab}" 在上游 integrations.ts 中已不存在 —— 上游可能改了 key，需重新确认隐藏规则`)
    }
  }

  const visibleTabs = upstreamTabs.filter((t) => !hiddenTabs.includes(t))
  console.log('ℹ 上游集成项 :', upstreamTabs.join(', ') || '(无)')
  console.log('ℹ 已隐藏     :', hiddenTabs.join(', ') || '(无)')
  console.log('ℹ 仍可见     :', visibleTabs.join(', ') || '(无)')
  console.log('ℹ → 上游新增集成项若也需隐藏，请把它的 key 补进 branding.ts 的 HIDDEN_INTEGRATION_TABS')
}

// ── 3：各消费点的过滤调用是否还在（防上游重构把 filter 删掉）─────────
const consumers = [
  ['src/views/settings/Settings.vue', ['isHiddenSettingsSection', 'isHiddenIntegrationTab']],
  ['src/components/UserMenu.vue', ['isHiddenUserMenuItem']],
]

for (const [file, markers] of consumers) {
  const src = read(file)
  if (src === null) {
    fail(`✗ 找不到 ${file} —— 上游可能移动或重命名了该文件`)
    continue
  }
  for (const marker of markers) {
    if (!src.includes(marker)) {
      fail(`✗ ${file} 中找不到 ${marker}() 调用 —— 上游可能重构了构建逻辑，隐藏功能已静默失效`)
    }
  }
}

// ── 4：Logo 消费点是否还在 ────────────────────────────────────────────
for (const file of ['src/components/menu.vue', 'src/views/auth/Login.vue']) {
  const src = read(file)
  if (src === null) {
    fail(`✗ 找不到 ${file} —— 上游可能移动或重命名了该文件`)
    continue
  }
  if (!src.includes('BRAND') && !src.includes('brandLogo')) {
    fail(`✗ ${file} 中找不到品牌 Logo 引用 —— Logo 换源逻辑已失效`)
  }
}

// ── 5：文案覆盖层是否就位 ────────────────────────────────────────────
// 详细的逐条对账（上游新增 / 覆盖失效）由 `npm run branding:merge` 负责，
// 这里只做粗粒度存在性检查，保证 CI 门禁不依赖 tsx。
const brandMessagesSrc = read('src/i18n/brandMessages.ts')
const i18nIndexSrc = read('src/i18n/index.ts')

if (brandMessagesSrc === null) {
  fail('✗ 找不到 src/i18n/brandMessages.ts —— 文案覆盖层丢失，品牌字样会重新露出')
} else if (i18nIndexSrc === null) {
  fail('✗ 找不到 src/i18n/index.ts')
} else {
  if (!brandMessagesSrc.includes('BRAND_TEXT_KEYS')) {
    fail('✗ brandMessages.ts 中缺少 BRAND_TEXT_KEYS —— 覆盖层结构被改动')
  }
  if (!i18nIndexSrc.includes("from './brandMessages.ts'")) {
    fail('✗ i18n/index.ts 未引入 brandMessages.ts —— 覆盖层未生效，文案覆盖全部失效')
  }
  if (!i18nIndexSrc.includes('withBrand(')) {
    fail('✗ i18n/index.ts 中找不到 withBrand() 调用 —— 覆盖层未接入 messages 构建')
  }
  const keyCount = (brandMessagesSrc.match(/BRAND_TEXT_KEYS\s*=\s*\[([\s\S]*?)\]/) || [, ''])[1]
    .split(',').filter((s) => s.trim()).length
  console.log(`ℹ 文案覆盖层：${keyCount} 个 key × ${Object.keys(
    (brandMessagesSrc.match(/^\s{2}'[a-z]{2}-[A-Z]{2}':\s*\{/gm) || []),
  ).length} 种语言`)
  console.log('ℹ 逐条对账请运行: npm run branding:merge')
}

// ── 汇总 ──────────────────────────────────────────────────────────────
if (problems.length > 0) {
  console.error('\n品牌定制漂移检测发现问题：')
  for (const p of problems) console.error('  ' + p)
  console.error('\n→ 请人工确认隐藏规则与上游结构是否仍然匹配。')
  process.exit(1)
}

console.log('\n✓ 品牌定制漂移检测通过')
