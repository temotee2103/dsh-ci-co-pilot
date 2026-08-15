import { GitHubError, dateOnly, resolveRepo } from '../github.js'
import { categorize, releaseNotesMarkdown } from '../format.js'

const DEFAULT_PER_PAGE = 100
const GITHUB_FOUNDING_DATE = '2008-02-08'

/** Resolve a ref or tag to { date, sha }. */
async function resolveRef(client, repo, ref, signal) {
  try {
    const tag = await client.request('GET', `/repos/${repo}/git/ref/tags/${encodeURIComponent(ref)}`, { signal })
    let sha = tag.object?.sha
    if (tag.object?.type === 'tag') {
      const tagObject = await client.request('GET', `/repos/${repo}/git/tags/${sha}`, { signal })
      sha = tagObject.object?.sha
    }
    const commit = await client.request('GET', `/repos/${repo}/commits/${sha}`, { signal })
    return { date: commit.commit?.committer?.date ?? commit.commit?.author?.date ?? null, sha }
  } catch {
    try {
      const commit = await client.request('GET', `/repos/${repo}/commits/${encodeURIComponent(ref)}`, { signal })
      return { date: commit.commit?.committer?.date ?? commit.commit?.author?.date ?? null, sha: commit.sha }
    } catch {
      return { date: null, sha: null }
    }
  }
}

export function createReleaseNotesTool(client, config = {}) {
  const perPage = Math.min(config.perPage ?? DEFAULT_PER_PAGE, 100)
  return {
    name: 'gh_release_notes',
    description:
      'Generate release notes from PRs merged since a tag, ref, or date. PRs are grouped into breaking changes / features / bug fixes / docs / dependencies / chores by label or conventional-commit prefix.',
    parameters: {
      repo: { type: 'string', description: 'Owner/name of the repository. Defaults to the configured repo.' },
      from: { type: 'string', description: '"latest" (last release), a tag or ref, or an ISO date like 2026-08-01. Default "latest".' },
      to: { type: 'string', description: 'End ref (default: now).' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: value.markdown }],
    },
    async execute(args, exec) {
      const repo = resolveRepo(args.repo, client.defaultRepo ?? '')
      const now = new Date()

      let fromLabel = (args.from ?? 'latest').trim() || 'latest'
      let fromDate = null
      if (fromLabel === 'latest') {
        try {
          const latest = await client.request('GET', `/repos/${repo}/releases/latest`, { signal: exec.signal })
          fromDate = dateOnly(latest.published_at)
          fromLabel = latest.tag_name ?? 'latest'
        } catch {
          fromDate = null
        }
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(fromLabel)) {
        fromDate = fromLabel
      } else {
        const resolved = await resolveRef(client, repo, fromLabel, exec.signal)
        fromDate = dateOnly(resolved.date)
        if (!fromDate) {
          throw new GitHubError(`Could not resolve "${fromLabel}" to a date. Pass "latest", a tag/ref, or an ISO date.`)
        }
      }
      fromDate = fromDate ?? GITHUB_FOUNDING_DATE

      let toLabel = (args.to ?? '').trim() || 'now'
      let toDate = null
      if (toLabel === 'now') {
        toDate = dateOnly(now.toISOString())
      } else {
        const resolved = await resolveRef(client, repo, toLabel, exec.signal)
        toDate = dateOnly(resolved.date) ?? dateOnly(now.toISOString())
      }

      const results = await client.request('GET', '/search/issues', {
        query: {
          q: `repo:${repo} is:pr is:merged merged:${fromDate}..${toDate}`,
          sort: 'updated',
          order: 'desc',
          per_page: perPage,
        },
        signal: exec.signal,
      })

      const prs = (results.items ?? []).map((item) => ({
        number: item.number,
        title: item.title,
        labels: (item.labels ?? []).map((label) => (typeof label === 'string' ? label : label.name)),
      }))

      const sections = { breaking: [], features: [], fixes: [], docs: [], dependencies: [], chores: [], other: [] }
      for (const pr of prs) {
        sections[categorize(pr, pr.labels)].push(pr)
      }

      const markdown = releaseNotesMarkdown({ repo, from: fromLabel, to: toLabel, sections })
      return {
        repo,
        from: fromLabel,
        to: toLabel,
        mergedSince: fromDate,
        mergedUntil: toDate,
        total: prs.length,
        sections,
        markdown,
      }
    },
  }
}
