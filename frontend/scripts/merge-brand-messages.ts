#!/usr/bin/env tsx
/**
 * 品牌文案对账脚本 —— 上游 WeKnora 升级后使用。
 *
 * 品牌覆盖层（src/i18n/brandMessages.ts）是独立文件，升级时不会被冲掉；
 * 但上游 locale 文件会变 —— 可能新增含 WeKnora 的文案，也可能删除/改写
 * 已被覆盖的 key。这个脚本做三方对账：
 *
 *   ✅ 已覆盖      上游该条仍含 WeKnora，覆盖层已接管
 *   ⚠️ 上游新增    上游新增了含 WeKnora 的文案，覆盖层还没接管 → 需人工评估
 *   🗑️ 覆盖失效    覆盖层覆盖的 key 在上游已不存在，或上游已自行去掉品牌字样
 *                  → 覆盖层里的这行已无意义，可清理
 *
 * 用法：
 *   npm run branding:merge                # 全量对账
 *   npm run branding:merge -- --locale=zh-CN
 *
 * 退出码：0 = 无新增、无失效；1 = 有需要人工处理的项目。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { BRAND_TEXT_KEYS, BRAND_TEXT_EXCLUDED, BRAND_TEXT_TEMPLATES } from '../src/i18n/brandMessages.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const locales = Object.keys(BRAND_TEXT_TEMPLATES)
const only = process.argv.find((a) => a.startsWith('--locale='))?.split('=')[1]
const targets = only ? locales.filter((l) => l === only) : locales

type LocaleTree = Record<string, unknown>

function loadLocale(locale: string): LocaleTree {
  const file = join(root, 'src/i18n/locales', `${locale}.ts`)
  const src = readFileSync(file, 'utf8')
  const body = src.replace(/^\s*export\s+default\s+/, '').replace(/;\s*$/, '')
  try {
    return new Function(`return (${body})`)() as LocaleTree
  } catch (e) {
    console.error(`解析 ${locale}.ts 失败：${(e as Error).message}`)
    process.exit(2)
  }
}

/** 收集所有 value 含 WeKnora 的条目 → key 路径集合 */
function collectBrandText(node: unknown, path: string[] = [], out = new Set<string>()): Set<string> {
  if (typeof node === 'string') {
    if (node.includes('WeKnora')) out.add(path.join('.'))
    return out
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as LocaleTree)) {
      collectBrandText(v, [...path, k], out)
    }
  }
  return out
}

/** 取指定点分路径的字符串值 */
function pick(node: LocaleTree, path: string): string | undefined {
  let cursor: unknown = node
  for (const seg of path.split('.')) {
    if (!cursor || typeof cursor !== 'object') return undefined
    cursor = (cursor as LocaleTree)[seg]
  }
  return typeof cursor === 'string' ? cursor : undefined
}

const covered = new Set<string>(BRAND_TEXT_KEYS)
let needsAttention = 0

for (const locale of targets) {
  const tree = loadLocale(locale)
  const upstreamBrandText = collectBrandText(tree)

  const stillNeeded = [...covered].filter((k) => upstreamBrandText.has(k))
  const excludedStill = [...covered].length >= 0
    ? [...upstreamBrandText].filter((k) => BRAND_TEXT_EXCLUDED[k] !== undefined)
    : []
  const upstreamNew = [...upstreamBrandText].filter(
    (k) => !covered.has(k) && BRAND_TEXT_EXCLUDED[k] === undefined,
  )
  const stale = [...covered].filter((k) => !upstreamBrandText.has(k))
  const excludedGone = Object.keys(BRAND_TEXT_EXCLUDED).filter(
    (k) => !upstreamBrandText.has(k) && !covered.has(k),
  )

  console.log(`\n===== ${locale} =====`)
  console.log(`  上游含 WeKnora 的文案 : ${upstreamBrandText.size} 条`)
  console.log(`  ✅ 覆盖层已接管       : ${stillNeeded.length} 条`)
  console.log(`  ⊘ 刻意保留（原样）    : ${excludedStill.length} 条`)
  console.log(`  ⚠️ 上游新增未覆盖     : ${upstreamNew.length} 条`)
  console.log(`  🗑️ 覆盖已失效         : ${stale.length} 条`)

  if (upstreamNew.length) {
    needsAttention += upstreamNew.length
    console.log(`  ── 需要人工决策 ──`)
    for (const k of upstreamNew) {
      console.log(`       - ${k}`)
      const v = pick(tree, k)
      if (v) console.log(`         "${v.replace(/\n/g, '\\n').slice(0, 150)}"`)
    }
    console.log(`     → 若是用户可见的品牌文案，补进 brandMessages.ts 的 BRAND_TEXT_TEMPLATES；`)
    console.log(`       否则加入 BRAND_TEXT_EXCLUDED 并注明归类原因。`)
  }

  if (stale.length) {
    needsAttention += stale.length
    console.log(`  ── 覆盖已失效，需清理 ──`)
    for (const k of stale) {
      const v = pick(tree, k)
      console.log(`       - ${k}${v === undefined ? '  (上游已删除该 key)' : '  (上游已自行去掉品牌字样)'}`)
    }
    console.log(`     → 从 brandMessages.ts 的 BRAND_TEXT_TEMPLATES 中移除。`)
  }

  if (excludedGone.length) {
    console.log(`  ── 刻意保留清单中，上游已无对应文案（可清理清单，不影响功能）──`)
    for (const k of excludedGone) console.log(`       - ${k}`)
  }
}

console.log('')
if (needsAttention === 0) {
  console.log('✓ 文案对账通过：覆盖层与上游完全对齐，无需人工处理')
} else {
  console.log(`✗ 文案对账发现 ${needsAttention} 项需要人工处理（见上方明细）`)
  process.exit(1)
}
