import { resolveRepo } from '../github.js'
import { repoStatusMarkdown } from '../format.js'

const DEFAULT_RUNS = 10
const MAX_RUNS = 25

export function createRepoStatusTool(client, config = {}) {
  const runs = Math.min(config.runs ?? DEFAULT_RUNS, MAX_RUNS)
  return {
    name: 'gh_repo_status',
    description:
      'One-call repository health snapshot: metadata (stars, default branch, last push), open PR / issue counts and the most recent Actions workflow runs. Use it to decide what to work on next.',
    parameters: {
      repo: { type: 'string', description: 'Owner/name of the repository. Defaults to the configured repo.' },
      runs: { type: 'number', description: `How many recent workflow runs to include (default ${runs}, max ${MAX_RUNS}).` },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: repoStatusMarkdown(value) }],
    },
    async execute(args, exec) {
      const repo = resolveRepo(args.repo, client.defaultRepo ?? '')
      const limit = Math.min(args.runs ?? runs, MAX_RUNS)
      const [meta, runsResp, prSearch, issueSearch] = await Promise.all([
        client.request('GET', `/repos/${repo}`, { signal: exec.signal }),
        client.request('GET', `/repos/${repo}/actions/runs`, { query: { per_page: limit }, signal: exec.signal }),
        client
          .request('GET', '/search/issues', { query: { q: `repo:${repo} is:pr is:open`, per_page: 1 }, signal: exec.signal })
          .catch(() => null),
        client
          .request('GET', '/search/issues', { query: { q: `repo:${repo} is:issue is:open`, per_page: 1 }, signal: exec.signal })
          .catch(() => null),
      ])
      return {
        repo,
        meta: {
          name: meta.name ?? null,
          description: meta.description ?? null,
          language: meta.language ?? null,
          defaultBranch: meta.default_branch ?? null,
          stars: meta.stargazers_count ?? 0,
          forks: meta.forks_count ?? 0,
          watchers: meta.subscribers_count ?? 0,
          openIssuesCount: meta.open_issues_count ?? 0,
          archived: Boolean(meta.archived),
          pushedAt: meta.pushed_at ?? null,
        },
        openPrs: prSearch?.total_count ?? null,
        openIssues: issueSearch?.total_count ?? null,
        runs: (runsResp?.workflow_runs ?? []).map((run) => ({
          id: run.id,
          name: run.name,
          branch: run.head_branch ?? null,
          status: run.status,
          conclusion: run.conclusion ?? null,
          createdAt: run.created_at ?? null,
          url: run.html_url ?? null,
        })),
      }
    },
  }
}
