import { describe, it, expect } from 'vitest'
import {
  markdownToTelegramHtml,
  splitMarkdownForTelegram,
  MAX_MARKDOWN_CHUNK,
} from '../markdown.js'

describe('markdownToTelegramHtml', () => {
  it('renders bold, italic, strikethrough, and inline code', () => {
    const out = markdownToTelegramHtml('**bold** and *italic* and ~~old~~ and `code`')
    expect(out).toBe('<b>bold</b> and <i>italic</i> and <s>old</s> and <code>code</code>')
  })

  it('renders __bold__ and _italic_ underscore variants', () => {
    expect(markdownToTelegramHtml('__bold__ and _ital_')).toBe('<b>bold</b> and <i>ital</i>')
  })

  it('does not mistake snake_case for italic', () => {
    expect(markdownToTelegramHtml('foo_bar_baz')).toBe('foo_bar_baz')
  })

  it('maps headings to bold (no leading hash)', () => {
    const out = markdownToTelegramHtml('# H1\n## H2\n### H3')
    expect(out).toBe('<b>H1</b>\n<b>H2</b>\n<b>H3</b>')
  })

  it('escapes raw HTML special chars in plain text', () => {
    expect(markdownToTelegramHtml('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d')
  })

  it('preserves fenced code block content verbatim (HTML-escaped, no markdown inside)', () => {
    const md = '```ts\nconst x: number = 1 < 2 && **not bold**\n```'
    const out = markdownToTelegramHtml(md)
    expect(out).toBe(
      '<pre><code class="language-ts">const x: number = 1 &lt; 2 &amp;&amp; **not bold**</code></pre>',
    )
  })

  it('preserves fenced code block without language', () => {
    const out = markdownToTelegramHtml('```\nhello\n```')
    expect(out).toBe('<pre>hello</pre>')
  })

  it('inline code is HTML-escaped and not re-parsed', () => {
    const out = markdownToTelegramHtml('use `<div>` for **markup**')
    expect(out).toBe('use <code>&lt;div&gt;</code> for <b>markup</b>')
  })

  it('renders bullet lists with • prefix preserving indent', () => {
    const out = markdownToTelegramHtml('- one\n- two\n  - nested')
    expect(out).toBe('• one\n• two\n  • nested')
  })

  it('leaves numbered lists alone', () => {
    expect(markdownToTelegramHtml('1. first\n2. second')).toBe('1. first\n2. second')
  })

  it('renders safe links and drops javascript: hrefs', () => {
    expect(markdownToTelegramHtml('[ok](https://x.com) [bad](javascript:alert)')).toBe(
      '<a href="https://x.com">ok</a> bad',
    )
  })

  it('wraps consecutive > lines in a single blockquote', () => {
    const out = markdownToTelegramHtml('> first\n> second\n\nafter')
    expect(out).toContain('<blockquote>first\nsecond</blockquote>')
    expect(out).toContain('after')
  })

  it('renders horizontal rule as a divider', () => {
    expect(markdownToTelegramHtml('above\n---\nbelow')).toContain('━━')
  })

  it('renders tables as a monospace pre block', () => {
    const md = '| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |'
    const out = markdownToTelegramHtml(md)
    expect(out.startsWith('<pre>')).toBe(true)
    expect(out.endsWith('</pre>')).toBe(true)
    expect(out).toContain('1 │ 2')
    expect(out).toContain('3 │ 4')
  })

  it('does not apply bold inside fenced code blocks', () => {
    const out = markdownToTelegramHtml('```\n**not bold**\n```')
    expect(out).toBe('<pre>**not bold**</pre>')
  })

  it('handles a realistic mixed message', () => {
    const md = [
      '## 2330 收盤檢視',
      '',
      '- **收盤價**: 1,050',
      '- 量能 vs 5日均: +25%',
      '',
      '> 法人連 3 日買超',
      '',
      '`P/E` 落在歷史 75 百分位',
    ].join('\n')
    const out = markdownToTelegramHtml(md)
    expect(out).toContain('<b>2330 收盤檢視</b>')
    expect(out).toContain('• <b>收盤價</b>: 1,050')
    expect(out).toContain('<blockquote>法人連 3 日買超</blockquote>')
    expect(out).toContain('<code>P/E</code>')
  })
})

describe('splitMarkdownForTelegram', () => {
  it('returns input unchanged when under the limit', () => {
    expect(splitMarkdownForTelegram('hello', 100)).toEqual(['hello'])
  })

  it('splits at blank-line boundaries', () => {
    const md = 'para one\n\npara two\n\npara three'
    const chunks = splitMarkdownForTelegram(md, 15)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(15)
  })

  it('never splits inside a fenced code block', () => {
    const md = ['intro', '', '```ts', 'line A', 'line B', 'line C', '```', '', 'outro'].join('\n')
    const chunks = splitMarkdownForTelegram(md, 30)
    const fenced = chunks.find((c) => c.includes('```ts'))
    expect(fenced).toBeDefined()
    expect(fenced).toContain('line A')
    expect(fenced).toContain('line B')
    expect(fenced).toContain('line C')
    // and the closing fence is in the same chunk
    expect((fenced!.match(/```/g) ?? []).length).toBe(2)
  })

  it('hard-splits a single oversized block', () => {
    const block = 'word '.repeat(200) // 1000 chars
    const chunks = splitMarkdownForTelegram(block, 200)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(200)
  })

  it('packs small blocks together up to the limit', () => {
    const md = Array.from({ length: 10 }, (_, i) => `block${i}`).join('\n\n')
    const chunks = splitMarkdownForTelegram(md, 40)
    expect(chunks.length).toBeLessThan(10)
  })

  it('default budget leaves room for HTML expansion', () => {
    expect(MAX_MARKDOWN_CHUNK).toBeLessThan(4096)
  })
})
