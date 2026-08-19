import { describe, expect, it, vi } from 'vitest'
import { createReviewPrTool } from '../src/tools/review-pr.js'
import { createSubmitReviewTool } from '../src/tools/submit-review.js'
import { createFixCiTool } from '../src/tools/fix-ci.js'
import { createTriageIssuesTool } from '../src/tools/triage-issues.js'
import { createUpdateIssueTool } from '../src/tools/update-issue.js'
import { createRerunCiTool } from '../src/tools/rerun-ci.js'
import { createCreateReleaseTool } from '../src/tools/create-release.js'
import { createListPullsTool } from '../src/tools/list-pulls.js'
import { createRepoStatusTool } from '../src/tools/repo-status.js'
import { listPullsMarkdown, repoStatusMarkdown } from '../src/format.js'

const exec = { signal: new AbortController().signal }

/** Build a fake client whose routes map "METHOD path" -> value or handler. */
function makeClient(routes) {
  const request = vi.fn(async (method, path, opts = {}) => {
    const key = `${method} ${path}`
    const handler = routes[key]
    if (typeof handler === 'function') return handler(opts)
    if (handler !== undefined) return handler
    throw new Error(`Unexpected request: ${key}`)
  })
  const collect = vi.fn(async (method, path, opts = {}) => {
    const key = `${method} ${path}`
    const handler = routes[key]
    if (typeof handler === 'function') return handler(opts)
    return handler ?? []
  })
  return { request, collect, defaultRepo: '' }
}

const PR = {
  title: 'feat: add widget',
  state: 'open',
  merged_at: null,
  user: { login: 'ada' },
  base: { ref: 'main' },
  head: { ref: 'feature/widget', sha: 'abc123def456' },
  body: 'Adds a widget.',
  additions: 10,
  deletions: 2,
  changed_files: 1,
  created_at: '2026-08-10T00:00:00Z',
}

describe('gh_review_pr', () => {
  it('assembles PR, files, reviews and CI status', async () => {
    const client = makeClient({
      'GET /repos/o/r/pulls/7': (opts) => (opts?.headers?.accept?.includes('diff') ? '--- diff ---' : PR),
      'GET /repos/o/r/pulls/7/files': [{ filename: 'src/a.js', status: 'modified', additions: 8, deletions: 1, patch: '@@ -1 +1 @@' }],
      'GET /repos/o/r/pulls/7/reviews': [{ user: { login: 'grace' }, state: 'COMMENTED', body: 'nice' }],
      'GET /repos/o/r/commits/abc123def456/check-runs': {
        total_count: 2,
        check_runs: [
          { name: 'lint', conclusion: 'success' },
          { name: 'test', conclusion: 'failure', details_url: 'https://github.com/o/r/actions/runs/5' },
        ],
      },
    })
    const tool = createReviewPrTool(client)
    const value = await tool.execute({ number: 7, repo: 'o/r' }, exec)
    expect(value.repo).toBe('o/r')
    expect(value.pr.title).toBe('feat: add widget')
    expect(value.files).toHaveLength(1)
    expect(value.checks.failed.map((c) => c.name)).toEqual(['test'])
    expect(value.diff).toBe('--- diff ---')
  })

  it('skips the diff when includeDiff is false', async () => {
    const client = makeClient({
      'GET /repos/o/r/pulls/7': PR,
      'GET /repos/o/r/pulls/7/files': [],
      'GET /repos/o/r/pulls/7/reviews': [],
      'GET /repos/o/r/commits/abc123def456/check-runs': { total_count: 0, check_runs: [] },
    })
    const tool = createReviewPrTool(client)
    const value = await tool.execute({ number: 7, repo: 'o/r', includeDiff: false }, exec)
    expect(value.diff).toBeNull()
    const diffCalls = client.request.mock.calls.filter(
      ([method, path, opts]) => method === 'GET' && path === '/repos/o/r/pulls/7' && opts?.headers?.accept?.includes('diff'),
    )
    expect(diffCalls).toHaveLength(0)
  })

  it('truncates an oversized diff', async () => {
    const client = makeClient({
      'GET /repos/o/r/pulls/7': (opts) => (opts?.headers?.accept?.includes('diff') ? 'y'.repeat(500) : PR),
      'GET /repos/o/r/pulls/7/files': [],
      'GET /repos/o/r/pulls/7/reviews': [],
      'GET /repos/o/r/commits/abc123def456/check-runs': { total_count: 0, check_runs: [] },
    })
    const tool = createReviewPrTool(client, { maxDiffChars: 100 })
    const value = await tool.execute({ number: 7, repo: 'o/r' }, exec)
    expect(value.diff.length).toBeLessThan(150)
  })
})

describe('gh_submit_review', () => {
  it('posts the review with inline comments', async () => {
    const client = makeClient({
      'POST /repos/o/r/pulls/7/reviews': { id: 42, state: 'APPROVED' },
    })
    const tool = createSubmitReviewTool(client)
    const value = await tool.execute(
      { number: 7, repo: 'o/r', event: 'APPROVE', body: 'LGTM', comments: [{ path: 'a.js', line: 3, body: 'nit' }] },
      exec,
    )
    expect(value.id).toBe(42)
    const [method, path, opts] = client.request.mock.calls[0]
    expect(`${method} ${path}`).toBe('POST /repos/o/r/pulls/7/reviews')
    expect(opts.body).toEqual({
      body: 'LGTM',
      event: 'APPROVE',
      comments: [{ path: 'a.js', line: 3, body: 'nit' }],
    })
  })
})

describe('gh_fix_ci', () => {
  it('reports failed jobs and log tails for a workflow run', async () => {
    const client = makeClient({
      'GET /repos/o/r/actions/runs/5': { id: 5, name: 'ci', status: 'completed', conclusion: 'failure', head_sha: 'abc123def456', html_url: 'https://r/5' },
      'GET /repos/o/r/actions/runs/5/jobs': {
        jobs: [
          { id: 8, name: 'test', conclusion: 'success' },
          { id: 9, name: 'lint', conclusion: 'failure', html_url: 'https://r/jobs/9' },
        ],
      },
      'GET /repos/o/r/actions/jobs/9/logs': 'line1\nline2\nline3',
    })
    const tool = createFixCiTool(client)
    const value = await tool.execute({ repo: 'o/r', runId: 5 }, exec)
    expect(value.failed).toHaveLength(1)
    expect(value.failed[0].name).toBe('lint')
    expect(value.failed[0].logTail).toBe('line1\nline2\nline3')
  })

  it('fetches annotations for failing checks on a ref', async () => {
    const client = makeClient({
      'GET /repos/o/r/commits/main/check-runs': {
        total_count: 1,
        check_runs: [
          { id: 11, name: 'unit', conclusion: 'failure', details_url: 'https://github.com/o/r/actions/runs/5' },
        ],
      },
      'GET /repos/o/r/check-runs/11/annotations': [
        { path: 'src/a.js', start_line: 4, message: 'Expected 1, got 2' },
      ],
      'GET /repos/o/r/actions/runs/5/jobs': {
        jobs: [{ id: 9, name: 'unit', conclusion: 'failure' }],
      },
      'GET /repos/o/r/actions/jobs/9/logs': 'log line',
    })
    const tool = createFixCiTool(client)
    const value = await tool.execute({ repo: 'o/r', ref: 'main' }, exec)
    expect(value.failed[0].annotations).toEqual([{ path: 'src/a.js', start_line: 4, message: 'Expected 1, got 2' }])
  })
})

describe('gh_triage_issues', () => {
  it('flags stale and needs-triage issues', async () => {
    const client = makeClient({
      'GET /repos/o/r/issues': [
        { number: 1, title: 'old and unlabeled', created_at: '2026-01-01T00:00:00Z', comments: 0, labels: [], user: { login: 'a' }, html_url: 'https://i/1' },
        { number: 2, title: 'fresh with labels', created_at: '2026-08-14T00:00:00Z', comments: 3, labels: [{ name: 'bug' }], user: { login: 'b' }, html_url: 'https://i/2' },
      ],
    })
    const tool = createTriageIssuesTool(client, { staleDays: 30 })
    const value = await tool.execute({ repo: 'o/r' }, exec)
    expect(value.stale).toBe(1)
    expect(value.needsTriage).toBe(1)
    expect(value.issues[0].stale).toBe(true)
    expect(value.issues[0].needsTriage).toBe(true)
  })
})

describe('gh_update_issue', () => {
  it('posts a comment', async () => {
    const client = makeClient({
      'POST /repos/o/r/issues/3/comments': { id: 9 },
    })
    const tool = createUpdateIssueTool(client)
    const value = await tool.execute({ number: 3, repo: 'o/r', action: 'comment', comment: 'thanks!' }, exec)
    expect(value.commentId).toBe(9)
    expect(client.request.mock.calls[0][2].body).toEqual({ body: 'thanks!' })
  })

  it('appends labels without removing existing ones', async () => {
    const client = makeClient({
      'GET /repos/o/r/issues/3': { labels: [{ name: 'bug' }] },
      'PATCH /repos/o/r/issues/3': { number: 3, state: 'open', labels: [{ name: 'bug' }, { name: 'triage' }] },
    })
    const tool = createUpdateIssueTool(client)
    await tool.execute({ number: 3, repo: 'o/r', action: 'label', addLabels: ['triage'] }, exec)
    const patch = client.request.mock.calls.find(([m]) => m === 'PATCH')[2].body
    expect(patch.labels).toEqual(['bug', 'triage'])
  })

  it('closes an issue', async () => {
    const client = makeClient({
      'PATCH /repos/o/r/issues/3': { number: 3, state: 'closed', labels: [], assignees: [] },
    })
    const tool = createUpdateIssueTool(client)
    const value = await tool.execute({ number: 3, repo: 'o/r', action: 'close' }, exec)
    expect(client.request.mock.calls[0][2].body).toEqual({ state: 'closed' })
    expect(value.action).toBe('close')
  })
})

describe('gh_rerun_ci', () => {
  it('reruns only failed jobs by default', async () => {
    const client = makeClient({
      'POST /repos/o/r/actions/runs/5/rerun-failed-jobs': {},
    })
    const tool = createRerunCiTool(client)
    const value = await tool.execute({ repo: 'o/r', runId: 5 }, exec)
    expect(value.mode).toBe('failed-jobs')
    expect(value.reran).toBe(true)
    expect(client.request.mock.calls[0][1]).toBe('/repos/o/r/actions/runs/5/rerun-failed-jobs')
  })

  it('reruns all jobs when failedOnly is false', async () => {
    const client = makeClient({
      'POST /repos/o/r/actions/runs/5/rerun': {},
    })
    const tool = createRerunCiTool(client)
    await tool.execute({ repo: 'o/r', runId: 5, failedOnly: false }, exec)
    expect(client.request.mock.calls[0][1]).toBe('/repos/o/r/actions/runs/5/rerun')
  })
})

describe('gh_create_release', () => {
  it('creates a release with the given tag and notes', async () => {
    const client = makeClient({
      'POST /repos/o/r/releases': {
        id: 12,
        tag_name: 'v0.2.0',
        name: 'v0.2.0',
        draft: false,
        prerelease: false,
        html_url: 'https://github.com/o/r/releases/tag/v0.2.0',
      },
    })
    const tool = createCreateReleaseTool(client)
    const value = await tool.execute(
      { repo: 'o/r', tag: 'v0.2.0', body: '## Features\n- widget (#3)' },
      exec,
    )
    const payload = client.request.mock.calls[0][2].body
    expect(payload.tag_name).toBe('v0.2.0')
    expect(payload.body).toContain('widget')
    expect(payload.draft).toBe(false)
    expect(value.htmlUrl).toContain('releases/tag/v0.2.0')
  })

  it('sends target_commitish when provided', async () => {
    const client = makeClient({
      'POST /repos/o/r/releases': { id: 13, tag_name: 'v0.2.0', name: 'v0.2.0', draft: false, prerelease: false },
    })
    const tool = createCreateReleaseTool(client)
    await tool.execute({ repo: 'o/r', tag: 'v0.2.0', target: 'abc123' }, exec)
    expect(client.request.mock.calls[0][2].body.target_commitish).toBe('abc123')
  })
})

describe('gh_list_pulls', () => {
  it('lists PRs with age, label and draft signals', async () => {
    const client = makeClient({
      'GET /repos/o/r/pulls': [
        { number: 12, title: 'feat: x', state: 'open', draft: false, created_at: '2026-08-10T00:00:00Z', labels: [{ name: 'bug' }], head: { ref: 'f/x' }, base: { ref: 'main' }, user: { login: 'ada' }, html_url: 'https://p/12' },
        { number: 13, title: 'wip: y', state: 'open', draft: true, created_at: '2026-08-15T00:00:00Z', labels: [], head: { ref: 'f/y' }, base: { ref: 'main' }, user: { login: 'bob' }, html_url: 'https://p/13' },
      ],
    })
    const tool = createListPullsTool(client)
    const value = await tool.execute({ repo: 'o/r', state: 'open' }, exec)
    expect(value.total).toBe(2)
    expect(value.open).toBe(2)
    expect(value.drafts).toBe(1)
    expect(value.items[0].labels).toEqual(['bug'])
    expect(value.items[1].draft).toBe(true)
    const [method, path, opts] = client.collect.mock.calls[0]
    expect(`${method} ${path}`).toBe('GET /repos/o/r/pulls')
    expect(opts.query.state).toBe('open')
    expect(opts.query.sort).toBe('created')
  })

  it('renders a markdown summary', () => {
    const markdown = listPullsMarkdown({
      repo: 'o/r',
      total: 1,
      open: 1,
      drafts: 1,
      items: [
        { number: 13, title: 'wip: y', author: 'bob', daysOpen: 2, labels: [], draft: true, head: 'f/y', base: 'main' },
      ],
    })
    expect(markdown).toContain('#13 wip: y')
    expect(markdown).toContain('draft')
  })
})

describe('gh_repo_status', () => {
  it('assembles a repo health snapshot', async () => {
    const client = makeClient({
      'GET /repos/o/r': {
        name: 'r',
        description: 'demo',
        language: 'JavaScript',
        default_branch: 'main',
        stargazers_count: 42,
        forks_count: 3,
        subscribers_count: 1,
        open_issues_count: 5,
        archived: false,
        pushed_at: '2026-08-17T00:00:00Z',
      },
      'GET /repos/o/r/actions/runs': {
        workflow_runs: [
          { id: 55, name: 'ci', head_branch: 'main', status: 'completed', conclusion: 'success', created_at: '2026-08-17T00:00:00Z', html_url: 'https://r/55' },
          { id: 54, name: 'ci', head_branch: 'main', status: 'completed', conclusion: 'failure', created_at: '2026-08-16T00:00:00Z', html_url: 'https://r/54' },
        ],
      },
      'GET /search/issues': (opts) => {
        const q = opts?.query?.q ?? ''
        return q.includes('is:pr') ? { total_count: 2, items: [] } : { total_count: 3, items: [] }
      },
    })
    const tool = createRepoStatusTool(client)
    const value = await tool.execute({ repo: 'o/r' }, exec)
    expect(value.meta.stars).toBe(42)
    expect(value.meta.defaultBranch).toBe('main')
    expect(value.openPrs).toBe(2)
    expect(value.openIssues).toBe(3)
    expect(value.runs).toHaveLength(2)
    expect(value.runs[0].conclusion).toBe('success')
    expect(value.runs[1].conclusion).toBe('failure')
  })

  it('renders a markdown summary', () => {
    const markdown = repoStatusMarkdown({
      repo: 'o/r',
      meta: { name: 'r', description: 'demo', language: 'JavaScript', defaultBranch: 'main', stars: 42, forks: 3, watchers: 1, openIssuesCount: 5, archived: false, pushedAt: '2026-08-17T00:00:00Z' },
      openPrs: 2,
      openIssues: 3,
      runs: [{ id: 55, name: 'ci', branch: 'main', status: 'completed', conclusion: 'success', createdAt: '2026-08-17T00:00:00Z' }],
    })
    expect(markdown).toContain('⭐ 42')
    expect(markdown).toContain('2 open PRs')
    expect(markdown).toContain('Recent workflow runs')
    expect(markdown).toContain('#55')
  })
})
