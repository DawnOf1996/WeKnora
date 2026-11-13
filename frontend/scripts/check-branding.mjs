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

// ── 5：覆盖层 key 是否仍存在于上游 locale（防上游改名）─────────────────
const brandMessagesSrc = read('src/i18n/brandMessages.ts')
const zhSrc = read('src/i18n/locales/zh-CN.ts')

if (brandMessagesSrc === null) {
  console.log('ℹ 尚未创建 i18n 文案覆盖层 brandMessages.ts —— 跳过文案校验')
} else if (zhSrc === null) {
  fail('✗ 找不到 src/i18n/locales/zh-CN.ts —— 上游可能重命名了 locale 文件')
} else {
  const zhBlock = brandMessagesSrc.match(/'zh-CN'\s*:\s*\{([\s\S]*?)\n {2}\}/)?.[1] ?? ''
  const paths = [...zhBlock.matchAll(/'([^']+)'\s*:/g)].map((m) => m[1])
  for (const path of paths) {
    const leaf = path.split('.').pop()
    const leafPattern = new RegExp(`['"\`]?${leaf}['"\`]?\\s*:`)
    if (!leafPattern.test(zhSrc)) {
      fail(`⚠ 覆盖层 key "${path}" 在上游 zh-CN.ts 中未找到同名键 —— 上游可能已改名，请复核该文案`)
    }
  }
  console.log(`ℹ 文案覆盖层校验完成（zh-CN ${paths.length} 条）`)
}

// ── 汇总 ──────────────────────────────────────────────────────────────
if (problems.length > 0) {
  console.error('\n品牌定制漂移检测发现问题：')
  for (const p of problems) console.error('  ' + p)
  console.error('\n→ 请人工确认隐藏规则与上游结构是否仍然匹配。')
  process.exit(1)
}

console.log('\n✓ 品牌定制漂移检测通过')
