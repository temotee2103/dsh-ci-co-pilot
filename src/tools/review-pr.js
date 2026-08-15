import { pick, resolveRepo } from '../github.js'
import { reviewPrMarkdown } from '../format.js'

const DEFAULT_MAX_FILES = 50
const DEFAULT_MAX_DIFF_CHARS = 20000

const GREEN_CONCLUSIONS = new Set(['success', 'skipped', 'neutral'])

export function createReviewPrTool(client, config = {}) {
  const maxFiles = config.maxFiles ?? DEFAULT_MAX_FILES
  const maxDiffChars = config.maxDiffChars ?? DEFAULT_MAX_DIFF_CHARS
  return {
    name: 'gh_review_pr',
    description:
      'Fetch a pull request with its changed files, unified diff, existing reviews and CI status, so the agent can write a code review. Returns structured data; the agent does the reviewing.',
    parameters: {
      repo: { type: 'string', description: 'Owner/name of the repository, e.g. "deepseek-ai/deepseek-harness". Defaults to the configured repo.' },
      number: { type: 'number', required: true, description: 'Pull request number.' },
      includeDiff: { type: 'boolean', description: 'Include the unified diff (default true, truncated).' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: reviewPrMarkdown(value) }],
    },
    async execute(args, exec) {
      const repo = resolveRepo(args.repo, client.defaultRepo ?? '')
      const pr = await client.request('GET', `/repos/${repo}/pulls/${args.number}`, { signal: exec.signal })
      const [files, reviews, checks] = await Promise.all([
        client.request('GET', `/repos/${repo}/pulls/${args.number}/files`, {
          query: { per_page: maxFiles },
          signal: exec.signal,
        }),
        client.request('GET', `/repos/${repo}/pulls/${args.number}/reviews`, { signal: exec.signal }),
        client
          .request('GET', `/repos/${repo}/commits/${pr.head?.sha}/check-runs`, {
            query: { per_page: 100 },
            signal: exec.signal,
          })
          .catch(() => null),
      ])

      let diff = null
      if (args.includeDiff !== false) {
        try {
          diff = await client.request('GET', `/repos/${repo}/pulls/${args.number}`, {
            headers: { accept: 'application/vnd.github.v3.diff' },
            signal: exec.signal,
          })
          if (typeof diff === 'string' && diff.length > maxDiffChars) {
            diff = `${diff.slice(0, maxDiffChars)}\n… (diff truncated)`
          }
        } catch {
          diff = null
        }
      }

      const failedChecks = (checks?.check_runs ?? [])
        .filter((check) => check.conclusion && !GREEN_CONCLUSIONS.has(check.conclusion))
        .map((check) => pick(check, ['name', 'conclusion', 'details_url']))

      return {
        repo,
        number: args.number,
        pr: {
          title: pr.title,
          state: pr.state,
          merged: Boolean(pr.merged_at),
          author: pr.user?.login ?? null,
          base: pr.base?.ref ?? null,
          head: pr.head?.ref ?? null,
          sha: pr.head?.sha ?? null,
          body: pr.body ?? '',
          additions: pr.additions ?? 0,
          deletions: pr.deletions ?? 0,
          changedFiles: pr.changed_files ?? 0,
          createdAt: pr.created_at ?? null,
        },
        files: (files ?? []).map((file) => ({
          path: file.filename,
          status: file.status,
          additions: file.additions ?? 0,
          deletions: file.deletions ?? 0,
          patch: file.patch ?? null,
        })),
        reviews: (reviews ?? []).map((review) => ({
          author: review.user?.login ?? null,
          state: review.state,
          submittedAt: review.submitted_at ?? null,
          body: review.body ?? '',
        })),
        checks: checks ? { total: checks.total_count ?? 0, failed: failedChecks } : null,
        diff,
      }
    },
  }
}
