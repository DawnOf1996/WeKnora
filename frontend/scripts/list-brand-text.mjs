// 提取 locale 文件中所有 value 含品牌词的条目及其完整点分 key 路径。
//
// 用法:
//   node scripts/list-brand-text.mjs                      列出全部 6 种语言
//   node scripts/list-brand-text.mjs zh-CN                只列中文
//   node scripts/list-brand-text.mjs zh-CN en-US          列多种语言
//   node scripts/list-brand-text.mjs src/i18n/locales/zh-CN.ts   传文件路径
//   node scripts/list-brand-text.mjs zh-CN settings.docsUrl      只看指定 key
//
// 输出格式: <点分 key 路径>\t<原始 value>
//
// 匹配大小写不敏感，且覆盖两类上游专有名称：
//   WeKnora    产品自称（WeKnora / weknora-app / WEKNORA_* 三种写法）
//   DocReader  文档解析服务名（DocReader / DOCREADER_* 两种写法）
// 只匹配 `WeKnora` 会漏掉小写服务名。
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const LOCALE_DIR = resolve(here, '../src/i18n/locales')
const LOCALES = ['zh-CN', 'zh-TW', 'en-US', 'ru-RU', 'ko-KR', 'ja-JP']
const BRAND_WORD = /weknora|docreader/i

const args = process.argv.slice(2)

// ── 参数解析：第一个参数决定目标 locale，剩余参数若含 '.' 则视为 key 过滤 ──
const targets = []
let keys = []
for (const arg of args) {
  if (arg.includes('.')) {
    keys.push(arg)
  } else if (!targets.length || targets.length >= 1) {
    targets.push(arg)
  }
}

function resolveLocale(arg) {
  const asPath = resolve(process.cwd(), arg)
  if (existsSync(asPath) && !LOCALES.includes(arg)) return asPath
  if (LOCALES.includes(arg)) return resolve(LOCALE_DIR, `${arg}.ts`)
  return null
}

const list = targets.length ? targets : LOCALES
const resolved = []
for (const t of list) {
  const p = resolveLocale(t)
  if (!p) {
    console.error(`无法识别的 locale: ${t}（可用：${LOCALES.join(', ')}，或直接给文件路径）`)
    process.exit(1)
  }
  resolved.push({ name: t, path: p })
}

let total = 0
for (const { name, path } of resolved) {
  const src = readFileSync(path, 'utf8')
  const body = src.replace(/^\s*export\s+default\s+/, '').replace(/;\s*$/, '')

  let obj
  try {
    obj = new Function(`return (${body})`)()
  } catch (e) {
    console.error(`解析失败 (${name}): ${e.message}`)
    process.exit(1)
  }

  const rows = []
  const walk = (node, pathParts) => {
    if (typeof node === 'string') {
      if (BRAND_WORD.test(node)) rows.push({ path: pathParts.join('.'), value: node })
      return
    }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(v, [...pathParts, k])
    }
  }
  walk(obj, [])

  const selected = keys.length ? rows.filter((r) => keys.includes(r.path)) : rows
  for (const r of selected) {
    console.log(`${r.path}\t${r.value.replace(/\n/g, '\\n')}`)
  }
  if (keys.length) {
    const missing = keys.filter((k) => !rows.some((r) => r.path === k))
    for (const k of missing) console.log(`${k}\t<<<NOT-FOUND-IN-${name}>>>`)
  }
  total += selected.length
}

console.log(`共 ${total} 条（语言：${resolved.map((r) => r.name).join(', ')}）`)
