import assert from 'node:assert/strict'
import test from 'node:test'

import { BRAND_TEXT_EXCLUDED, BRAND_TEXT_KEYS, BRAND_TEXT_TEMPLATES, buildBrandMessages } from './brandMessages.ts'

test('covered keys exist in the locale templates that need them', () => {
  const locales = Object.keys(BRAND_TEXT_TEMPLATES)
  assert.equal(locales.length, 6)
  // 覆盖层按语言可选：每个语言只需覆盖「该语言上游原文确实含品牌词」的那几条，
  // 但所有语言模板的并集必须等于登记清单 BRAND_TEXT_KEYS。
  const union = new Set<string>()
  for (const locale of locales) {
    for (const key of Object.keys(BRAND_TEXT_TEMPLATES[locale])) {
      union.add(key)
      assert.ok(
        (BRAND_TEXT_KEYS as readonly string[]).includes(key),
        `${locale}/${key} 写进了模板但没登记进 BRAND_TEXT_KEYS`,
      )
    }
  }
  assert.deepEqual(
    [...union].sort(),
    [...BRAND_TEXT_KEYS].sort(),
    '各语言模板的并集应与 BRAND_TEXT_KEYS 完全一致',
  )
})

/**
 * 模板里允许出现的技术字面量 —— 用户必须照抄，删了会坏。
 * 检测品牌词时先把这些片段摘掉，再判断是否还有残留。
 */
const ALLOWED_TECHNICAL_LITERALS = [/aud=weknora/gi, /X-WeKnora-Signature/gi]

test('no template still contains the upstream brand word', () => {
  for (const [locale, templates] of Object.entries(BRAND_TEXT_TEMPLATES)) {
    for (const [key, value] of Object.entries(templates)) {
      // 大小写不敏感：上游同时存在 WeKnora / weknora-app / WEKNORA_* 三种写法
      let rest = value
      for (const literal of ALLOWED_TECHNICAL_LITERALS) rest = rest.replace(literal, '')
      assert.ok(
        !/weknora/i.test(rest),
        `${locale}/${key} 的模板里仍含品牌词：${value.slice(0, 80)}`,
      )
    }
  }
})

test('placeholders are resolved and technical literals survive', () => {
  const messages = buildBrandMessages('zh-CN', '知识库助手', '智能助手')
  assert.equal(messages['assistant.title'], '智能助手')
  assert.equal(messages['createChat.title'], 'Hi，我是知识库助手，让你的知识触手可及')
  assert.equal(messages['auth.firstTime'], '首次使用知识库助手？')
  assert.equal(messages['newUserGuide.steps.welcome.title'], '欢迎使用知识库助手')
  // JWT audience 是协议字面量，必须原样保留
  assert.ok(messages['integrations.api.signedFlowDetail'].includes('aud=weknora'))
  // 品牌名已替换
  assert.ok(!messages['integrations.api.signedFlowDetail'].includes('WeKnora 与'))
})

test('every locale substitutes its own product name', () => {
  const names: Record<string, string> = {
    'zh-CN': '知识库助手',
    'zh-TW': '知識庫助手',
    'en-US': 'Knowledge Assistant',
    'ru-RU': 'Ассистент знаний',
    'ko-KR': '지식 어시스턴트',
    'ja-JP': 'ナレッジアシスタント',
  }
  for (const [locale, name] of Object.entries(names)) {
    const messages = buildBrandMessages(locale, name, '助手')
    assert.ok(
      messages['auth.firstTime'].includes(name),
      `${locale} 的文案应包含该语言的产品名`,
    )
  }
})

test('system info page carries no upstream service names', () => {
  // 上游原文：'当前应用服务（weknora-app）的版本号' 等 3 条。
  // weknora-app / weknora-ui / weknora-docreader 是上游 docker-compose 的
  // 服务名，出现在「系统信息」页的说明文字里，普通用户看得见 —— 必须换掉。
  const keys = [
    'system.versionDescription',
    'system.frontendVersionDescription',
    'system.docreaderVersionDescription',
  ] as const
  for (const locale of Object.keys(BRAND_TEXT_TEMPLATES)) {
    const messages = buildBrandMessages(locale, 'X', 'Y')
    for (const key of keys) {
      assert.ok(
        !/weknora/i.test(messages[key]),
        `${locale}/${key} 仍含上游服务名：${messages[key]}`,
      )
      assert.ok(messages[key].length > 0, `${locale}/${key} 覆盖后不应为空`)
    }
    // DocReader 是部署里真实的解析服务名（与 DOCREADER_* 环境变量同源），
    // 保留它才能和上一行的「Docreader 版本」标签对得上。
    assert.ok(
      messages['system.docreaderVersionDescription'].includes('DocReader'),
      `${locale} 的 DocReader 说明应保留服务名，与标签保持一致`,
    )
  }
})

test('sandbox settings copy carries no upstream product name', () => {
  // 沙箱配置抽屉里所有带品牌词的说明与标题。用户实际能看到的是「连接」步的
  // DNS 说明（cubeDnsServersHelp）与「模板」步的模板卡片标题。
  const keys = [
    'settings.sandbox.cubeDnsServersHelp',
    'settings.sandbox.weknoraStandardTemplate',
    'settings.sandbox.weknoraDesktopTemplate',
    'settings.sandbox.weknoraDockerImage',
    'settings.sandbox.weknoraTemplateTitle',
    'settings.sandbox.weknoraTemplateOverview',
    'settings.sandbox.weknoraTemplateDescription',
    'settings.sandbox.standardTemplateProvisioning',
    'settings.sandbox.desktopTemplateProvisioning',
    'settings.sandbox.replaceStandardTemplateConfirm',
    'settings.sandbox.replaceDesktopTemplateConfirm',
    'settings.sandbox.templateUntaggedHint',
    'settings.sandbox.dockerHostRisk',
    'settings.sandbox.dockerTlsCertPathHelp',
    'settings.sandbox.dockerIdleTtlHelp',
  ]
  for (const locale of Object.keys(BRAND_TEXT_TEMPLATES)) {
    const messages = buildBrandMessages(locale, 'X', 'Y')
    for (const key of keys) {
      assert.ok(messages[key], `${locale}/${key} 应有覆盖文案`)
      assert.ok(
        !/weknora/i.test(messages[key]),
        `${locale}/${key} 仍含上游专名：${messages[key]}`,
      )
    }
  }
})

test('the DNS hint keeps the operational details while dropping the brand', () => {
  const messages = buildBrandMessages('zh-CN', '知识库助手', '智能助手')
  const hint = messages['settings.sandbox.cubeDnsServersHelp']
  assert.ok(hint.includes('nameserver'), 'DNS 参数名不能丢')
  assert.ok(hint.includes('119.29.29.29'), '集群默认 DNS 示例不能丢')
  assert.ok(hint.includes('10/8'), '私网网段提示不能丢')
  assert.ok(hint.includes('标准模板'), '模板应改用中性称呼')
})

test('exclusion list uses known reasons only', () => {
  const reasons = new Set(['hidden-feature', 'technical-literal', 'real-object-name'])
  for (const [key, reason] of Object.entries(BRAND_TEXT_EXCLUDED)) {
    assert.ok(reasons.has(reason), `${key} 的归类原因非法：${reason}`)
    assert.ok(
      !BRAND_TEXT_KEYS.includes(key as never),
      `${key} 同时出现在覆盖与排除清单中，语义冲突`,
    )
  }
})

test('CJK locales drop the space around a CJK brand name', () => {
  const messages = buildBrandMessages('zh-CN', '知识库助手', '智能助手')
  assert.equal(messages['createChat.title'], 'Hi，我是知识库助手，让你的知识触手可及')
  assert.equal(messages['assistant.welcomeDesc'], '我可以解答知识库助手的使用问题，整理知识与文档，帮你配置智能体、工具和自动化。')
  assert.ok(!messages['assistant.welcomeDesc'].includes('  '), '不应出现连续空格')
})

test('Korean keeps the word space between brand name and particle', () => {
  const messages = buildBrandMessages('ko-KR', '지식 어시스턴트', '어시스턴트')
  assert.equal(messages['assistant.welcomeDesc'], '지식 어시스턴트 사용법을 안내하고, 지식과 문서를 정리하며, 에이전트·도구·자동화 설정을 도와드릴 수 있습니다.')
  assert.ok(!messages['assistant.welcomeDesc'].includes('어시스턴트사용법'), '韩文助词前必须保留空格')
})

test('Latin locales keep the template spacing', () => {
  const messages = buildBrandMessages('en-US', 'Knowledge Assistant', 'Smart Assistant')
  assert.equal(messages['auth.firstTime'], 'New to Knowledge Assistant?')
  assert.equal(messages['assistant.welcomeDesc'], 'I can answer questions about Knowledge Assistant, organize knowledge and documents, and help set up agents, tools and automations.')
})

test('Russian avoids undeclined positions for the product name', () => {
  const messages = buildBrandMessages('ru-RU', 'Ассистент знаний', 'ассистент')
  // 俄语产品名可变格，模板只允许出现在主格/宾格位置
  assert.ok(!messages['auth.firstTime'].includes(' в '), '避免 «в + 宾格» 结构')
  assert.ok(!messages['newUserGuide.steps.welcome.title'].includes(' в '), '避免 «в + 宾格» 结构')
  assert.equal(messages['auth.firstTime'], 'Впервые используете Ассистент знаний?')
  assert.equal(messages['newUserGuide.steps.welcome.title'], 'Добро пожаловать! Это Ассистент знаний.')
})
