import { daysSince, resolveRepo } from '../github.js'
import { triageMarkdown } from '../format.js'

const DEFAULT_PER_PAGE = 50
const DEFAULT_STALE_DAYS = 30

export function createTriageIssuesTool(client, config = {}) {
  const perPage = config.perPage ?? DEFAULT_PER_PAGE
  const staleDays = config.staleDays ?? DEFAULT_STALE_DAYS
  return {
    name: 'gh_triage_issues',
    description:
      'List issues with triage signals (age, staleness, comment count, labels) so the agent can plan labels, assignments, priorities or cleanups.',
    parameters: {
      repo: { type: 'string', description: 'Owner/name of the repository. Defaults to the configured repo.' },
      state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Issue state (default open).' },
      labels: { type: 'string', description: 'Comma-separated label filter, e.g. "bug,help wanted".' },
      sort: { type: 'string', enum: ['created', 'updated', 'comments'], description: 'Sort key (default created).' },
      direction: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction (default desc).' },
      staleDays: { type: 'number', description: `Days after which an issue counts as stale (default ${staleDays}).` },
      limit: { type: 'number', description: `Maximum issues to return (default ${perPage}).` },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: triageMarkdown(value) }],
    },
    async execute(args, exec) {
      const repo = resolveRepo(args.repo, client.defaultRepo ?? '')
      const staleAfter = args.staleDays ?? staleDays
      const issues = await client.collect('GET', `/repos/${repo}/issues`, {
        query: {
          state: args.state ?? 'open',
          labels: args.labels || undefined,
          sort: args.sort ?? 'created',
          direction: args.direction ?? 'desc',
        },
        limit: args.limit ?? perPage,
        signal: exec.signal,
      })
      const mapped = (issues ?? [])
        .filter((issue) => !issue.pull_request)
        .map((issue) => {
          const daysOpen = daysSince(issue.created_at)
          const labels = (issue.labels ?? []).map((label) => (typeof label === 'string' ? label : label.name))
          const comments = issue.comments ?? 0
          return {
            number: issue.number,
            title: issue.title,
            author: issue.user?.login ?? null,
            daysOpen,
            comments,
            labels,
            stale: daysOpen !== null && daysOpen > staleAfter,
            needsTriage: labels.length === 0 && comments === 0,
            url: issue.html_url ?? null,
          }
        })
      return {
        repo,
        total: mapped.length,
        stale: mapped.filter((issue) => issue.stale).length,
        needsTriage: mapped.filter((issue) => issue.needsTriage).length,
        issues: mapped,
      }
    },
  }
}
