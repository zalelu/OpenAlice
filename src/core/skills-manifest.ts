/**
 * Skills manifest loader.
 *
 * When OpenAlice uses a custom systemPrompt (the persona), the Claude Agent
 * SDK still loads `.claude/skills/` from disk via settingSources, but the
 * AI doesn't know they exist because skills are normally declared in the
 * SDK's preset system prompt that we replaced.
 *
 * This module reads SKILL.md files at startup (and on each request, since
 * the count is small) and produces a compact text block to append to the
 * persona — making skills discoverable to the AI again.
 */

import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const SKILLS_ROOT = resolve('.claude/skills')

export interface SkillManifestEntry {
  name: string
  description: string
}

/**
 * Parse YAML frontmatter (only `name` + `description` — we don't need
 * a full YAML parser for this two-field schema).
 */
function parseFrontmatter(text: string): SkillManifestEntry | null {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!match) return null
  const yaml = match[1]
  const nameMatch = yaml.match(/^name:\s*(.+)$/m)
  const descMatch = yaml.match(/^description:\s*(.+(?:\n\s+.+)*)$/m)
  if (!nameMatch) return null
  return {
    name: nameMatch[1].trim(),
    description: (descMatch?.[1] ?? '').replace(/\s+/g, ' ').trim(),
  }
}

/**
 * Read every `<skill>/SKILL.md` under .claude/skills/. Returns empty
 * array if the directory doesn't exist (graceful — the system stays
 * functional without skills).
 */
export async function loadSkillsManifest(): Promise<SkillManifestEntry[]> {
  let entries: string[]
  try {
    entries = await readdir(SKILLS_ROOT)
  } catch {
    return []
  }
  const out: SkillManifestEntry[] = []
  for (const entry of entries) {
    const path = resolve(SKILLS_ROOT, entry, 'SKILL.md')
    try {
      const content = await readFile(path, 'utf-8')
      const parsed = parseFrontmatter(content)
      if (parsed) out.push(parsed)
    } catch { /* not a skill folder, skip */ }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Render the manifest as a system-prompt addendum. Empty string when no
 * skills are present, so callers can unconditionally concatenate.
 */
export function renderSkillsBlock(entries: SkillManifestEntry[]): string {
  if (entries.length === 0) return ''
  const lines = ['## Available Skills']
  lines.push('')
  lines.push('When the user input matches a skill\'s description, **invoke that skill** by following its instructions in `.claude/skills/<name>/SKILL.md`. Each skill is a complete workflow — read the file when triggered.')
  lines.push('')
  for (const e of entries) {
    lines.push(`- **${e.name}** — ${e.description}`)
  }
  return lines.join('\n')
}
