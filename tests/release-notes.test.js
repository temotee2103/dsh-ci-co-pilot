import { describe, expect, it } from 'vitest'
import { categorize, releaseNotesMarkdown } from '../src/format.js'
import { createReleaseNotesTool } from '../src/tools/release-notes.js'
import { createClient } from '../src/github.js'

const exec = { signal: new AbortController().signal }

describe('categorize', () => {
  it('maps labels to sections', () => {
    expect(categorize({ title: 'x' }, ['breaking'])).toBe('breaking')
    expect(categorize({ title: 'x' }, ['enhancement'])).toBe('features')
    expect(categorize({ title: 'x' }, ['bug'])).toBe('fixes')
    expect(categorize({ title: 'x' }, ['dependencies'])).toBe('dependencies')
  })
  it('falls back to conventional-commit prefixes', () => {
    expect(categorize({ title: 'feat: ship it' }, [])).toBe('features')
    expect(categorize({ title: 'fix: typo' }, [])).toBe('fixes')
    expect(categorize({ title: 'docs: readme' }, [])).toBe('docs')
    expect(categorize({ title: 'chore: bump' }, [])).toBe('chores')
    expect(categorize({ title: 'random title' }, [])).toBe('other')
  })
})

describe('releaseNotesMarkdown', () => {
  it('renders sections in order, skipping empty ones', () => {
    const markdown = releaseNotesMarkdown({
      repo: 'o/r',
      from: 'v1.0.0',
      to: 'main',
      sections: { breaking: [], features: [{ title: 'Add widget', number: 5 }], fixes: [], docs: [], dependencies: [], chores: [], other: [] },
    })
    expect(markdown).toContain('## 🚀 Features')
    expect(markdown).toContain('- Add widget (#5)')
    expect(markdown).not.toContain('Bug fixes')
    expect(markdown).not.toContain('Breaking changes')
  })
})

describe('gh_release_notes tool', () => {
  it('uses the latest release date as the lower bound and groups search results', async () => {
    const client = createClient()
    const originalRequest = client.request
    client.request = async (method, path, opts = {}) => {
      if (path === '/repos/o/r/releases/latest') return { tag_name: 'v1.0.0', published_at: '2026-08-01T10:00:00Z' }
      if (path === '/search/issues') {
        expect(opts.query.q).toContain('merged:2026-08-01..')
        return {
          items: [
            { number: 2, title: 'feat: widget', labels: [] },
            { number: 1, title: 'fix: crash', labels: [{ name: 'bug' }] },
          ],
        }
      }
      return originalRequest.call(client, method, path, opts)
    }
    const tool = createReleaseNotesTool(client)
    const value = await tool.execute({ repo: 'o/r' }, exec)
    expect(value.from).toBe('v1.0.0')
    expect(value.mergedSince).toBe('2026-08-01')
    expect(value.total).toBe(2)
    expect(value.sections.features).toHaveLength(1)
    expect(value.sections.fixes).toHaveLength(1)
    expect(value.markdown).toContain('## 🚀 Features')
  })

  it('accepts an explicit ISO date as the lower bound', async () => {
    let querySeen = null
    const client = createClient()
    client.request = async (_method, path, opts = {}) => {
      if (path === '/search/issues') {
        querySeen = opts.query.q
        return { items: [] }
      }
      throw new Error(`Unexpected: ${path}`)
    }
    const tool = createReleaseNotesTool(client)
    await tool.execute({ repo: 'o/r', from: '2026-07-15' }, exec)
    expect(querySeen).toContain('merged:2026-07-15..')
  })
})
