#!/usr/bin/env tsx
/**
 * 品牌文案对账脚本 —— 上游 WeKnora 升级后使用。
 *
 * 品牌覆盖层（src/i18n/brandMessages.ts）是独立文件，升级时不会被冲掉；
 * 但上游 locale 文件会变 —— 可能新增含 WeKnora 的文案，也可能删除/改写
 * 已被覆盖的 key。这个脚本做三方对账：
 *
 *   ✅ 已覆盖      上游该条仍含品牌词，覆盖层已接管
 *   ⚠️ 上游新增    上游新增了含品牌词的文案，覆盖层还没接管 → 需人工评估
 *   🗑️ 覆盖失效    覆盖层覆盖的 key 在上游已被删除 → 覆盖层里的这行已无意义
 *   ⊘ 覆盖冗余    上游该 key 还在，但上游自己已去掉品牌字样 → 覆盖层可以清理，
 *                  但不影响功能，不计入失败
 *
 * 覆盖层按语言可选（Partial）：只有该语言上游原文确实含品牌词的那一条才会
 * 被写进模板。因此「已覆盖」是**按语言**算的，而不是对所有语言统一算 ——
 * 比如 settings.sandbox.templateLoadHint 只有 en-US 原文带品牌词，其余 5 种
 * 语言不覆盖，上游改文案时我们跟着走。
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

/**
 * 收集所有 value 含上游专有名称的条目 → key 路径集合
 *
 * 匹配大小写不敏感，且覆盖两类上游专有名称：
 *   WeKnora   产品自称（WeKnora / weknora-app / WEKNORA_* 三种写法）
 *   DocReader 文档解析服务名（DocReader / DOCREADER_* 两种写法）
 *
 * 早先只匹配 `WeKnora`，导致小写服务名（weknora-app 等）整类漏检 ——
 * 「系统信息」页那三条说明文字就是这么漏掉的。
 */
function collectBrandText(node: unknown, path: string[] = [], out = new Set<string>()): Set<string> {
  if (typeof node === 'string') {
    if (/weknora|docreader/i.test(node)) out.add(path.join('.'))
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

const coveredAll = new Set<string>(BRAND_TEXT_KEYS)
let needsAttention = 0

// 登记清单必须等于所有语言模板的并集 —— 少登记 = 对账漏检，多登记 = 幽灵条目
const unionAll = new Set<string>()
for (const templates of Object.values(BRAND_TEXT_TEMPLATES)) {
  for (const key of Object.keys(templates)) unionAll.add(key)
}
const unregistered = [...coveredAll].filter((k) => !unionAll.has(k))
const ghosts = [...unionAll].filter((k) => !coveredAll.has(k))
if (unregistered.length || ghosts.length) {
  needsAttention += unregistered.length + ghosts.length
  console.log('\n===== 覆盖层登记 =====')
  console.log(`  ⚠️ 登记了但没有任何语言模板 : ${unregistered.length} 条`)
  for (const k of unregistered) console.log(`       - ${k}`)
  console.log(`  ⚠️ 模板里有但没登记         : ${ghosts.length} 条`)
  for (const k of ghosts) console.log(`       - ${k}`)
  console.log('     → BRAND_TEXT_KEYS 必须与各语言模板的并集完全一致')
}

for (const locale of targets) {
  const tree = loadLocale(locale)
  const upstreamBrandText = collectBrandText(tree)
  // 覆盖层按语言可选：只看该语言真正写了模板的那几条
  const covered = new Set<string>(Object.keys(BRAND_TEXT_TEMPLATES[locale] || {}))

  const stillNeeded = [...covered].filter((k) => upstreamBrandText.has(k))
  const excludedStill = [...upstreamBrandText].filter((k) => BRAND_TEXT_EXCLUDED[k] !== undefined)
  const upstreamNew = [...upstreamBrandText].filter(
    (k) => !covered.has(k) && BRAND_TEXT_EXCLUDED[k] === undefined,
  )
  // 上游把 key 删了 → 覆盖层这行已无意义，需要清理
  const stale = [...covered].filter((k) => pick(tree, k) === undefined)
  // 上游 key 还在、只是自己去了品牌字样 → 覆盖层变冗余，不影响功能
  const redundant = [...covered].filter(
    (k) => pick(tree, k) !== undefined && !upstreamBrandText.has(k),
  )
  const excludedGone = Object.keys(BRAND_TEXT_EXCLUDED).filter(
    (k) => !upstreamBrandText.has(k) && !covered.has(k),
  )

  console.log(`\n===== ${locale} =====`)
  console.log(`  上游含品牌词的文案   : ${upstreamBrandText.size} 条`)
  console.log(`  ✅ 覆盖层已接管       : ${stillNeeded.length} 条`)
  console.log(`  ⊘ 刻意保留（原样）    : ${excludedStill.length} 条`)
  console.log(`  ⚠️ 上游新增未覆盖     : ${upstreamNew.length} 条`)
  console.log(`  🗑️ 覆盖已失效         : ${stale.length} 条`)
  if (redundant.length) console.log(`  ⊘ 覆盖变冗余（可清理）: ${redundant.length} 条`)

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
      console.log(`       - ${k}  (上游已删除该 key)`)
    }
    console.log(`     → 从 brandMessages.ts 的 BRAND_TEXT_TEMPLATES 中移除。`)
  }

  if (redundant.length) {
    console.log('  ── 覆盖变冗余（上游已自行去掉品牌字样，可清理，不影响功能）──')
    for (const k of redundant) console.log(`       - ${k}`)
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
