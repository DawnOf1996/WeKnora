import assert from 'node:assert/strict'
import test from 'node:test'

import { BRAND_TEXT_EXCLUDED, BRAND_TEXT_KEYS, BRAND_TEXT_TEMPLATES, buildBrandMessages } from './brandMessages.ts'

test('every covered key exists in all six locale templates', () => {
  const locales = Object.keys(BRAND_TEXT_TEMPLATES)
  assert.equal(locales.length, 6)
  for (const locale of locales) {
    const keys = Object.keys(BRAND_TEXT_TEMPLATES[locale]).sort()
    assert.deepEqual(keys, [...BRAND_TEXT_KEYS].sort(), `${locale} 的 key 集合应与 BRAND_TEXT_KEYS 一致`)
  }
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
