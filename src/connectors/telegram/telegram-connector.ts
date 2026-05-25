/**
 * Telegram outbound connector.
 *
 * Delivers messages and media to a specific Telegram chat via the grammY
 * Bot API. Handles photo attachments (read from disk, sent via sendPhoto)
 * and converts Markdown text into Telegram's HTML subset for mobile-friendly
 * rendering. Long messages are split along block boundaries so each chunk
 * stays under the 4096-char per-message limit.
 *
 * Does not support streaming (no sendStream) — ConnectorCenter falls back
 * to draining the stream and calling send() with the completed result.
 */

import { readFile } from 'node:fs/promises'
import { Bot, InputFile } from 'grammy'
import type { Connector, ConnectorCapabilities, SendPayload, SendResult } from '../types.js'
import {
  MAX_MARKDOWN_CHUNK,
  MAX_TELEGRAM_MESSAGE_LENGTH,
  markdownToTelegramHtml,
  splitMarkdownForTelegram,
} from './markdown.js'

export const MAX_MESSAGE_LENGTH = MAX_TELEGRAM_MESSAGE_LENGTH

export class TelegramConnector implements Connector {
  readonly channel = 'telegram'
  readonly to: string
  readonly capabilities: ConnectorCapabilities = { push: true, media: true }

  constructor(
    private readonly bot: Bot,
    private readonly chatId: number,
  ) {
    this.to = String(chatId)
  }

  async send(payload: SendPayload): Promise<SendResult> {
    // Send media first (photos)
    if (payload.media && payload.media.length > 0) {
      for (const attachment of payload.media) {
        try {
          const buf = await readFile(attachment.path)
          await this.bot.api.sendPhoto(this.chatId, new InputFile(buf, 'screenshot.jpg'))
        } catch (err) {
          console.error('telegram: failed to send photo:', err)
        }
      }
    }

    if (payload.text) {
      await sendMarkdownChunks(this.bot, this.chatId, payload.text)
    }

    return { delivered: true }
  }
}

/**
 * Render markdown to Telegram-HTML and dispatch it, splitting across
 * messages where needed. Falls back to plain text (no parse_mode) if
 * Telegram rejects the HTML (rare — usually means our converter produced
 * something Telegram doesn't like).
 */
export async function sendMarkdownChunks(bot: Bot, chatId: number, markdown: string): Promise<void> {
  for (const chunk of splitMarkdownForTelegram(markdown, MAX_MARKDOWN_CHUNK)) {
    const html = markdownToTelegramHtml(chunk)
    try {
      await bot.api.sendMessage(chatId, html, { parse_mode: 'HTML' })
    } catch (err) {
      console.error('telegram: HTML send failed, retrying as plain text:', err)
      for (const plain of plainTextFallback(chunk)) {
        await bot.api.sendMessage(chatId, plain).catch((e) => {
          console.error('telegram: plain-text send also failed:', e)
        })
      }
    }
  }
}

function plainTextFallback(text: string): string[] {
  if (text.length <= MAX_TELEGRAM_MESSAGE_LENGTH) return [text]
  const out: string[] = []
  let rem = text
  while (rem.length > MAX_TELEGRAM_MESSAGE_LENGTH) {
    let cut = rem.lastIndexOf('\n', MAX_TELEGRAM_MESSAGE_LENGTH)
    if (cut < MAX_TELEGRAM_MESSAGE_LENGTH / 2) cut = rem.lastIndexOf(' ', MAX_TELEGRAM_MESSAGE_LENGTH)
    if (cut < MAX_TELEGRAM_MESSAGE_LENGTH / 2) cut = MAX_TELEGRAM_MESSAGE_LENGTH
    out.push(rem.slice(0, cut))
    rem = rem.slice(cut).trimStart()
  }
  if (rem.length) out.push(rem)
  return out
}

// Kept exported for backward compatibility with anything that imported it
// from this module. Prefer splitMarkdownForTelegram for new code.
export function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text]
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining)
      break
    }
    let splitAt = remaining.lastIndexOf('\n', maxLength)
    if (splitAt === -1 || splitAt < maxLength / 2) {
      splitAt = remaining.lastIndexOf(' ', maxLength)
    }
    if (splitAt === -1 || splitAt < maxLength / 2) {
      splitAt = maxLength
    }
    chunks.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt).trimStart()
  }
  return chunks
}
