import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const dark = readFileSync(new URL('./chat-hljs-dark.less', import.meta.url), 'utf8')

// Regression guard for the dark-theme code block bug: the light token colors
// live in scoped component styles, and their compiled specificity grows with
// the component's nesting depth — AgentStreamDisplay compiles to (0,6,0)
//   .answer-event .answer-content.markdown-content[data-v-x] .chat-code-block__pre .hljs
// while this global layer only reaches (0,4,1)
//   html[theme-mode=dark] .markdown-content .chat-code-block__pre .hljs
// so without an authoritative override the dark palette loses and the code
// text stays black in dark mode.

test('every hljs token color in the dark layer is authoritative', () => {
  // `(?<![\w-])` keeps background-color out of the match.
  const declarations = [...dark.matchAll(/(?<![\w-])color:\s*([^;{}]+)[;}]/g)]
  assert.ok(
    declarations.length >= 10,
    `expected the dark palette to define at least 10 token colors, found ${declarations.length}`,
  )
  for (const match of declarations) {
    assert.match(
      match[1],
      /!important\s*$/,
      `token color must be !important to beat scoped component rules: ${match[0].trim()}`,
    )
  }
})

test('the dark layer covers every container that renders chat code blocks', () => {
  for (const container of [
    '.markdown-content',
    '.answer-content',
    '.ai-markdown-template',
    '.agent-stream-display',
  ]) {
    assert.ok(
      dark.includes(`.${container.slice(1)} .chat-code-block__pre`),
      `dark layer must cover ${container}`,
    )
  }
})

test('the dark layer stays scoped to dark mode', () => {
  assert.match(dark, /html\[theme-mode='dark'\]/)
  assert.doesNotMatch(dark, /html\[theme-mode='light'\]/)
})
