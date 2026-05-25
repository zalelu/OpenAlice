/**
 * Convert AI-generated Markdown into the HTML subset that Telegram's
 * `parse_mode: 'HTML'` accepts, and split long messages along block
 * boundaries so each chunk is independently valid HTML.
 *
 * Telegram's HTML subset is small: b, i, u, s, code, pre, a, blockquote,
 * tg-spoiler. Everything else (headings, tables, hr, lists) is mapped
 * down to those primitives or to monospace blocks.
 */

export const MAX_TELEGRAM_MESSAGE_LENGTH = 4096

// Leave headroom because tag expansion (** → <b></b>) grows the HTML.
export const MAX_MARKDOWN_CHUNK = 3500

const PH_OPEN = '\x00PH'
const PH_CLOSE = '\x00'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeHref(url: string): string {
  if (!/^(https?:|tg:|mailto:)/i.test(url)) return ''
  return url.replace(/"/g, '%22').replace(/</g, '%3C').replace(/>/g, '%3E')
}

export function markdownToTelegramHtml(md: string): string {
  const stash: string[] = []
  const save = (html: string): string => {
    stash.push(html)
    return `${PH_OPEN}${stash.length - 1}${PH_CLOSE}`
  }

  let work = md

  // 1. Fenced code blocks (extract before any other transformation)
  work = work.replace(/```([\w+-]*)\r?\n?([\s\S]*?)```/g, (_m, lang: string, code: string) => {
    const body = escapeHtml(code.replace(/\n$/, ''))
    const html = lang
      ? `<pre><code class="language-${escapeHtml(lang)}">${body}</code></pre>`
      : `<pre>${body}</pre>`
    return save(html)
  })

  // 2. GitHub-style tables → monospace block
  work = work.replace(
    /(?:^\|.+\|[ \t]*\r?\n)(?:\|[ \t:|\-]+\|[ \t]*\r?\n)(?:\|.+\|[ \t]*(?:\r?\n|$))*/gm,
    (block) => save(`<pre>${escapeHtml(renderTable(block))}</pre>`),
  )

  // 3. Inline code
  work = work.replace(/`([^`\n]+)`/g, (_m, code: string) => save(`<code>${escapeHtml(code)}</code>`))

  // 4. Escape what remains (placeholders are pure ASCII control bytes, untouched)
  work = escapeHtml(work)

  // 5. Headings → bold
  work = work.replace(/^[ \t]*(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/gm, (_m, _h, text: string) => `<b>${text}</b>`)

  // 6. Blockquotes — group consecutive `> ` lines (now `&gt; ` after escape)
  work = work.replace(/(?:^&gt;[ \t]?.*(?:\r?\n|$))+/gm, (block) => {
    const inner = block
      .replace(/\r?\n$/, '')
      .split(/\r?\n/)
      .map((line) => line.replace(/^&gt;[ \t]?/, ''))
      .join('\n')
    return `<blockquote>${inner}</blockquote>\n`
  })

  // 7. Links [text](url) — text is already HTML-escaped
  work = work.replace(/\[([^\]\n]+?)\]\(([^)\s]+)(?:[ \t]+&quot;[^&]*&quot;)?\)/g, (_m, text: string, url: string) => {
    const safe = escapeHref(url)
    return safe ? `<a href="${safe}">${text}</a>` : text
  })

  // 8. Bold **x** then __x__
  work = work.replace(/\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*/g, '<b>$1</b>')
  work = work.replace(/(^|[^_\w])__(?=\S)([\s\S]+?)(?<=\S)__(?=$|[^_\w])/g, '$1<b>$2</b>')

  // 9. Italic *x* then _x_
  work = work.replace(/(^|[^*\w])\*(?=\S)([^*\n]+?)(?<=\S)\*(?=$|[^*\w])/g, '$1<i>$2</i>')
  work = work.replace(/(^|[^_\w])_(?=\S)([^_\n]+?)(?<=\S)_(?=$|[^_\w])/g, '$1<i>$2</i>')

  // 10. Strikethrough ~~x~~
  work = work.replace(/~~(?=\S)([^~\n]+?)(?<=\S)~~/g, '<s>$1</s>')

  // 11. Bullet lists → •
  work = work.replace(/^([ \t]*)[-*+][ \t]+(.+)$/gm, (_m, indent: string, body: string) => `${indent}• ${body}`)

  // 12. Horizontal rule
  work = work.replace(/^[ \t]*([-*_])\1{2,}[ \t]*$/gm, '━━━━━━━━━━━━━━')

  // 13. Restore extracted blocks
  work = work.replace(/\x00PH(\d+)\x00/g, (_m, idx: string) => stash[Number(idx)] ?? '')

  return work.trim()
}

function renderTable(md: string): string {
  const lines = md
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|'))
  if (lines.length < 2) return md
  const rows = lines
    .filter((_, i) => i !== 1)
    .map((l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
  const widths: number[] = []
  for (const row of rows) {
    row.forEach((cell, i) => {
      const w = cellWidth(cell)
      if (w > (widths[i] ?? 0)) widths[i] = w
    })
  }
  return rows.map((row) => row.map((c, i) => pad(c, widths[i] ?? 0)).join(' │ ')).join('\n')
}

function cellWidth(s: string): number {
  let w = 0
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0x9fff) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xff00 && cp <= 0xff60)
    w += wide ? 2 : 1
  }
  return w
}

function pad(s: string, target: number): string {
  return s + ' '.repeat(Math.max(0, target - cellWidth(s)))
}

/**
 * Split markdown into chunks small enough that each chunk's HTML output
 * fits in a single Telegram message. Splits at blank-line boundaries and
 * never inside a fenced code block.
 */
export function splitMarkdownForTelegram(md: string, maxRawChars = MAX_MARKDOWN_CHUNK): string[] {
  const blocks: string[] = []
  let inFence = false
  let buf: string[] = []
  const flush = () => {
    const block = buf.join('\n').replace(/\n+$/, '')
    if (block.trim()) blocks.push(block)
    buf = []
  }
  for (const line of md.split(/\r?\n/)) {
    if (line.trim().startsWith('```')) inFence = !inFence
    buf.push(line)
    if (!inFence && line.trim() === '' && buf.length > 1) flush()
  }
  flush()

  const chunks: string[] = []
  let acc: string[] = []
  let accLen = 0
  for (const block of blocks) {
    if (block.length > maxRawChars) {
      if (acc.length) {
        chunks.push(acc.join('\n\n'))
        acc = []
        accLen = 0
      }
      for (const sub of hardSplit(block, maxRawChars)) chunks.push(sub)
      continue
    }
    const add = (acc.length ? 2 : 0) + block.length
    if (accLen + add > maxRawChars) {
      chunks.push(acc.join('\n\n'))
      acc = [block]
      accLen = block.length
    } else {
      acc.push(block)
      accLen += add
    }
  }
  if (acc.length) chunks.push(acc.join('\n\n'))
  return chunks.length ? chunks : [md]
}

function hardSplit(text: string, max: number): string[] {
  const out: string[] = []
  let rem = text
  while (rem.length > max) {
    let cut = rem.lastIndexOf('\n', max)
    if (cut < max / 2) cut = rem.lastIndexOf(' ', max)
    if (cut < max / 2) cut = max
    out.push(rem.slice(0, cut))
    rem = rem.slice(cut).trimStart()
  }
  if (rem.length) out.push(rem)
  return out
}
