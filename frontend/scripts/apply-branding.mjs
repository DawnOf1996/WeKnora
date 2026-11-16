#!/usr/bin/env node
/**
 * 品牌定制一键整改脚本 —— 上游 WeKnora 升级后使用。
 *
 * 背景：上游升级可能重构掉我们的定制代码（例如把 Settings.vue 的 navItems
 * 构建逻辑重写），此时隐藏功能会「静默失效」—— 编译通过、测试通过，但菜单
 * 项又冒出来了。这个脚本按登记的集成点逐条检查，缺失的自动重新注入。
 *
 * 用法：
 *   npm run branding:apply            # 检查并整改（会改文件）
 *   npm run branding:apply -- --dry   # 只检查不修改
 *
 * 退出码：0 = 全部就位或已整改；1 = 有集成点无法自动整改，需人工处理。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dryRun = process.argv.includes('--dry') || process.argv.includes('--dry-run')

/**
 * 每个集成点 = { id, file, detect(src), apply(src) }
 *   detect 判定「是否已经在位」
 *   apply  返回整改后的源码；返回与入参相同表示锚点已丢失，需人工处理
 */
const PATCHES = [
  // ── 设置导航：隐藏 section 与集成 tab ────────────────────────────────
  {
    id: 'settings-nav-import',
    file: 'src/views/settings/Settings.vue',
    detect: (s) => s.includes("from '@/config/branding'"),
    apply: (s) => s.replace(
      "import { SETTINGS_SECTION_CAPABILITY, skillSettingsSupported } from '@/config/deploymentCapabilities'\n",
      "import { SETTINGS_SECTION_CAPABILITY, skillSettingsSupported } from '@/config/deploymentCapabilities'\nimport { isHiddenIntegrationTab, isHiddenSettingsSection } from '@/config/branding'\n",
    ),
  },
  {
    id: 'settings-nav-integration-filter',
    file: 'src/views/settings/Settings.vue',
    detect: (s) => s.includes('isHiddenIntegrationTab(item.key)'),
    apply: (s) => s.replace(
      'INTEGRATION_PREVIEW_ITEMS.map((item) => ({',
      'INTEGRATION_PREVIEW_ITEMS\n    .filter((item) => !isHiddenIntegrationTab(item.key))\n    .map((item) => ({',
    ),
  },
  {
    id: 'settings-nav-section-filter',
    file: 'src/views/settings/Settings.vue',
    detect: (s) => s.includes('isHiddenSettingsSection(it.key)'),
    apply: (s) => s.replace(
      'return all.filter((it) => canSeeSection(it.key) && isSectionSupported(it.key))',
      'return all\n    .filter((it) => canSeeSection(it.key) && isSectionSupported(it.key))\n    .filter((it) => !isHiddenSettingsSection(it.key))',
    ),
  },

  // ── 用户菜单：隐藏「帮助与文档」与「GitHub」 ─────────────────────────
  {
    id: 'user-menu-import',
    file: 'src/components/UserMenu.vue',
    detect: (s) => s.includes("from '@/config/branding'"),
    apply: (s) => s.replace(
      "import { SETTINGS_MANAGEMENT_SHORTCUT_MIN_ROLE } from '@/config/settingsAccess'\n",
      "import { SETTINGS_MANAGEMENT_SHORTCUT_MIN_ROLE } from '@/config/settingsAccess'\nimport { BRAND, isHiddenUserMenuItem } from '@/config/branding'\n",
    ),
  },
  {
    id: 'user-menu-docs-hidden',
    file: 'src/components/UserMenu.vue',
    detect: (s) => s.includes("isHiddenUserMenuItem('docs')"),
    apply: (s) => s.replace(
      '        <div class="menu-divider"></div>\n        <div class="menu-item" @click="openDocs">',
      '        <div v-if="!isHiddenUserMenuItem(\'docs\') || !isHiddenUserMenuItem(\'github\')" class="menu-divider"></div>\n        <div v-if="!isHiddenUserMenuItem(\'docs\')" class="menu-item" @click="openDocs">',
    ),
  },
  {
    id: 'user-menu-github-hidden',
    file: 'src/components/UserMenu.vue',
    detect: (s) => s.includes("isHiddenUserMenuItem('github')"),
    apply: (s) => s.replace(
      '        <div class="menu-item" :title="$t(\'common.githubStarTip\')" @click="openGithub">',
      '        <div v-if="!isHiddenUserMenuItem(\'github\')" class="menu-item" :title="$t(\'common.githubStarTip\')" @click="openGithub">',
    ),
  },
  {
    id: 'user-menu-brand-urls',
    file: 'src/components/UserMenu.vue',
    detect: (s) => s.includes('BRAND.docsUrl ||') && s.includes('BRAND.githubUrl ||'),
    apply: (s) => s
      .replace(
        "  window.open(docsUrl('home'), '_blank')",
        "  window.open(BRAND.docsUrl || docsUrl('home'), '_blank')",
      )
      .replace(
        "  window.open('https://github.com/Tencent/WeKnora', '_blank')",
        "  window.open(BRAND.githubUrl || 'https://github.com/Tencent/WeKnora', '_blank')",
      ),
  },

  // ── 侧栏 Logo ────────────────────────────────────────────────────────
  {
    id: 'sidebar-logo-import',
    file: 'src/components/menu.vue',
    detect: (s) => s.includes("from '@/config/branding'"),
    apply: (s) => s.replace(
      "import { TOOLBOX_ITEMS, canAccessToolboxSection } from '@/config/toolbox';\n",
      "import { TOOLBOX_ITEMS, canAccessToolboxSection } from '@/config/toolbox';\nimport { brandLogo as resolveBrandLogo, shouldShowLogo } from '@/config/branding';\nimport weknoraLogo from '@/assets/img/weknora.png';\n",
    ),
  },
  {
    id: 'sidebar-logo-template',
    file: 'src/components/menu.vue',
    detect: (s) => s.includes('v-if="showBrandLogo"') && s.includes(':src="brandLogo"'),
    apply: (s) => s
      .replace(
        '<div class="logo_box" @click="router.push(\'/platform/knowledge-bases\')"',
        '<div v-if="showBrandLogo" class="logo_box" @click="router.push(\'/platform/knowledge-bases\')"',
      )
      .replace(
        '<img class="logo" src="@/assets/img/weknora.png" alt="">',
        '<img class="logo" :src="brandLogo" alt="">',
      ),
  },
  {
    id: 'sidebar-logo-const',
    file: 'src/components/menu.vue',
    detect: (s) => s.includes('const showBrandLogo = shouldShowLogo()'),
    apply: (s) => s.replace(
      'const isLiteEdition = ref(false);',
      'const isLiteEdition = ref(false);\n// 品牌 Logo：显隐与资源均由 config/branding.ts 决定，上游升级时此处不需改动。\nconst showBrandLogo = shouldShowLogo();\nconst brandLogo = resolveBrandLogo(weknoraLogo);',
    ),
  },

  // ── 登录页 Logo 与顶部外链 ────────────────────────────────────────────
  {
    id: 'login-logo-import',
    file: 'src/views/auth/Login.vue',
    detect: (s) => s.includes("from '@/config/branding'"),
    apply: (s) => s.replace(
      "import screenshot4 from '@/assets/img/screenshot-4.svg'\n",
      "import screenshot4 from '@/assets/img/screenshot-4.svg'\nimport { BRAND, brandLogo as resolveBrandLogo, shouldShowLogo } from '@/config/branding'\nimport weknoraLogo from '@/assets/img/weknora.png'\n\n// 品牌 Logo 与外链：显隐、跳转目标均由 config/branding.ts 决定。\nconst showBrandLogo = shouldShowLogo()\nconst brandLogo = resolveBrandLogo(weknoraLogo)\n",
    ),
  },
  {
    id: 'login-logo-template',
    file: 'src/views/auth/Login.vue',
    detect: (s) => s.includes('v-if="showBrandLogo && BRAND.homepage"'),
    apply: (s) => s.replace(
      '    <a href="https://github.com/Tencent/WeKnora" target="_blank" class="header-logo" :title="$t(\'common.github\')">\n      <img src="@/assets/img/weknora.png" alt="WeKnora" class="logo-image" />\n    </a>',
      '    <a v-if="showBrandLogo && BRAND.homepage" :href="BRAND.homepage" target="_blank" class="header-logo" :title="BRAND.name">\n      <img :src="brandLogo" :alt="BRAND.name" class="logo-image" />\n    </a>\n    <span v-else-if="showBrandLogo" class="header-logo">\n      <img :src="brandLogo" :alt="BRAND.name" class="logo-image" />\n    </span>',
    ),
  },
  {
    id: 'login-external-links',
    file: 'src/views/auth/Login.vue',
    detect: (s) => s.includes('v-if="BRAND.websiteUrl"') && s.includes('v-if="BRAND.githubUrl"'),
    apply: (s) => s
      .replace(
        '<a href="https://weknora.weixin.qq.com" target="_blank" class="header-link"',
        '<a v-if="BRAND.websiteUrl" :href="BRAND.websiteUrl" target="_blank" class="header-link"',
      )
      .replace(
        '<a href="https://github.com/Tencent/WeKnora" target="_blank" class="header-link" :title="$t(\'common.info\')">',
        '<a v-if="BRAND.githubUrl" :href="BRAND.githubUrl" target="_blank" class="header-link" :title="$t(\'common.info\')">',
      ),
  },

  // ── i18n 品牌覆盖层接入 ──────────────────────────────────────────────
  {
    id: 'i18n-brand-merge',
    file: 'src/i18n/index.ts',
    detect: (s) => s.includes("from './brandMessages.ts'") && s.includes('withBrand(zhCN'),
    apply: (s) => s
      .replace(
        "import { pluralRules } from './pluralizationRules.ts'\n",
        "import { pluralRules } from './pluralizationRules.ts'\nimport { buildBrandMessages } from './brandMessages.ts'\nimport { BRAND, brandName } from '@/config/branding'\n",
      )
      .replace(
        "const messages = {\n  'zh-CN': zhCN,\n  'zh-TW': zhTW,\n  'en-US': enUS,\n  'ru-RU': ruRU,\n  'ko-KR': koKR,\n  'ja-JP': jaJP\n}",
        `/**
 * 品牌覆盖层合并：按点分路径深合并，brandMessages 的条目覆盖上游 locale。
 * 上游 locales/*.ts 保持原样 —— 上游每次发版都会改这些文件。
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
}`,
      ),
  },

  // ── 页面元信息 ───────────────────────────────────────────────────────
  {
    id: 'index-html-title',
    file: 'index.html',
    detect: (s) => !s.includes('<title>WeKnora</title>'),
    apply: (s) => s
      .replace('<title>WeKnora</title>', '<title>知识库助手</title>')
      .replace(
        'content="WeKnora是一款基于大语言模型的文档理解与语义检索框架，专为结构复杂、内容异构的文档场景而打造。"',
        'content="知识库助手：基于大语言模型的文档理解与语义检索平台，专为结构复杂、内容异构的文档场景而打造。"',
      ),
  },

  // ── npm 脚本 ─────────────────────────────────────────────────────────
  {
    id: 'package-scripts',
    file: 'package.json',
    detect: (s) => {
      try {
        const sc = JSON.parse(s).scripts || {}
        return sc['check-branding'] && sc['branding:apply'] && sc['branding:merge']
      } catch {
        return false
      }
    },
    apply: (s) => {
      let pkg
      try {
        pkg = JSON.parse(s)
      } catch {
        return s
      }
      const scripts = pkg.scripts || {}
      const want = {
        'check-branding': 'node scripts/check-branding.mjs',
        'branding:apply': 'node scripts/apply-branding.mjs',
        'branding:merge': 'tsx scripts/merge-brand-messages.ts',
      }
      let changed = false
      for (const [k, v] of Object.entries(want)) {
        if (scripts[k] !== v) {
          scripts[k] = v
          changed = true
        }
      }
      if (!changed) return s
      pkg.scripts = scripts
      return JSON.stringify(pkg, null, 2) + '\n'
    },
  },

  // ── 前端源码 LF 换行规则 ─────────────────────────────────────────────
  {
    id: 'gitattributes-lf',
    file: '../.gitattributes',
    detect: (s) => s.includes('*.vue text eol=lf'),
    apply: (s) => s.replace(
      'cli/acceptance/testdata/**/*.json text eol=lf\n',
      `cli/acceptance/testdata/**/*.json text eol=lf

# Force LF on frontend sources so Windows checkouts (core.autocrlf=true)
# don't trip the source-text assertions in frontend tests.
*.vue text eol=lf
*.ts text eol=lf
*.mts text eol=lf
*.mjs text eol=lf
*.js text eol=lf
*.html text eol=lf
*.css text eol=lf
*.less text eol=lf
`,
    ),
  },
]

// ── 执行 ──────────────────────────────────────────────────────────────
const files = new Map()
const readFile = (rel) => {
  if (!files.has(rel)) {
    const abs = join(root, rel)
    files.set(rel, existsSync(abs) ? readFileSync(abs, 'utf8') : null)
  }
  return files.get(rel)
}
const writeFile = (rel, content) => {
  writeFileSync(join(root, rel), content, 'utf8')
}

const results = []
for (const patch of PATCHES) {
  const src = readFile(patch.file)
  if (src === null) {
    results.push({ patch, status: 'missing-file' })
    continue
  }
  if (patch.detect(src)) {
    results.push({ patch, status: 'ok' })
    continue
  }
  const next = patch.apply(src)
  if (next === src) {
    results.push({ patch, status: 'anchor-lost' })
    continue
  }
  files.set(patch.file, next)
  results.push({ patch, status: dryRun ? 'would-fix' : 'fixed' })
}

if (!dryRun) {
  for (const [rel, content] of files) {
    if (content === null) continue
    writeFile(rel, content)
  }
}

const label = { ok: '已就位', fixed: '已整改', 'would-fix': '待整改', 'anchor-lost': '锚点丢失', 'missing-file': '文件缺失' }
let failed = 0
for (const r of results) {
  const mark = r.status === 'ok' ? '·' : r.status === 'anchor-lost' || r.status === 'missing-file' ? '✗' : '✓'
  if (r.status === 'anchor-lost' || r.status === 'missing-file') failed++
  console.log(`${mark} [${label[r.status]}] ${r.patch.id}  (${r.patch.file})`)
}

console.log('')
console.log(failed === 0
  ? `✓ 品牌定制集成点全部就位${dryRun ? '（dry-run，未修改文件）' : ''}`
  : `✗ 有 ${failed} 个集成点无法自动整改 —— 上游结构已变，请对照「版本升级操作手册」第 4 章人工处理`)

if (failed > 0) process.exit(1)
