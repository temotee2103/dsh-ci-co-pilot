import { daysSince, resolveRepo } from '../github.js'
import { listPullsMarkdown } from '../format.js'

const DEFAULT_LIMIT = 30

export function createListPullsTool(client, config = {}) {
  const limit = config.limit ?? DEFAULT_LIMIT
  return {
    name: 'gh_list_pulls',
    description:
      'List pull requests filtered by state, base or head branch, with age, label and draft signals — to find PRs to review, track a release train, or pick the next PR to work on.',
    parameters: {
      repo: { type: 'string', description: 'Owner/name of the repository. Defaults to the configured repo.' },
      state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'PR state (default open).' },
      base: { type: 'string', description: 'Filter by base branch name, e.g. "main".' },
      head: { type: 'string', description: 'Filter by head branch, e.g. "feature/x" or "owner:branch".' },
      sort: { type: 'string', enum: ['created', 'updated', 'popularity', 'long-running'], description: 'Sort key (default created).' },
      direction: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction (default desc).' },
      limit: { type: 'number', description: `Maximum PRs to return (default ${limit}).` },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: listPullsMarkdown(value) }],
    },
    async execute(args, exec) {
      const repo = resolveRepo(args.repo, client.defaultRepo ?? '')
      const pulls = await client.collect('GET', `/repos/${repo}/pulls`, {
        query: {
          state: args.state ?? 'open',
          ...(args.base ? { base: args.base } : {}),
          ...(args.head ? { head: args.head } : {}),
          sort: args.sort ?? 'created',
          direction: args.direction ?? 'desc',
        },
        limit: args.limit ?? limit,
        signal: exec.signal,
      })
      const items = (pulls ?? []).map((pr) => ({
        number: pr.number,
        title: pr.title,
        author: pr.user?.login ?? null,
        state: pr.state,
        draft: Boolean(pr.draft),
        daysOpen: daysSince(pr.created_at),
        labels: (pr.labels ?? []).map((label) => (typeof label === 'string' ? label : label.name)),
        head: pr.head?.ref ?? null,
        base: pr.base?.ref ?? null,
        url: pr.html_url ?? null,
      }))
      return {
        repo,
        total: items.length,
        open: items.filter((item) => item.state === 'open').length,
        drafts: items.filter((item) => item.draft).length,
        items,
      }
    },
  }
}
