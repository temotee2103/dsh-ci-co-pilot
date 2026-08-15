import { pick, resolveRepo, tailLines } from '../github.js'
import { fixCiMarkdown } from '../format.js'

const DEFAULT_MAX_LOG_LINES = 400
const DEFAULT_MAX_FAILED_CHECKS = 10
const GREEN_CONCLUSIONS = new Set(['success', 'skipped', 'neutral'])

export function createFixCiTool(client, config = {}) {
  const maxLogLines = config.maxLogLines ?? DEFAULT_MAX_LOG_LINES
  const maxFailedChecks = config.maxFailedChecks ?? DEFAULT_MAX_FAILED_CHECKS
  return {
    name: 'gh_fix_ci',
    description:
      'Inspect failing CI for a commit, branch, or Actions workflow run: failing checks, error annotations and log tails. The agent then fixes the code with its normal editing tools.',
    parameters: {
      repo: { type: 'string', description: 'Owner/name of the repository. Defaults to the configured repo.' },
      ref: { type: 'string', description: 'Commit SHA or branch name (ignored when runId is given). Defaults to the default branch.' },
      runId: { type: 'number', description: 'A specific Actions workflow run id.' },
      maxLogLines: { type: 'number', description: 'Log tail length per failed job (default 400).' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: fixCiMarkdown(value) }],
    },
    async execute(args, exec) {
      const repo = resolveRepo(args.repo, client.defaultRepo ?? '')
      const limit = args.maxLogLines ?? maxLogLines
      const failed = []
      let run = null
      let ref = args.ref?.trim() || 'HEAD'

      if (args.runId) {
        run = await client.request('GET', `/repos/${repo}/actions/runs/${args.runId}`, { signal: exec.signal })
        ref = run.head_sha?.slice(0, 7) ?? ref
        const jobs = await client.request('GET', `/repos/${repo}/actions/runs/${args.runId}/jobs`, {
          query: { per_page: 100 },
          signal: exec.signal,
        })
        const badJobs = (jobs.jobs ?? []).filter(
          (job) => job.conclusion && !GREEN_CONCLUSIONS.has(job.conclusion),
        )
        for (const job of badJobs.slice(0, maxFailedChecks)) {
          let logTail = null
          try {
            const logText = await client.request('GET', `/repos/${repo}/actions/jobs/${job.id}/logs`, {
              signal: exec.signal,
            })
            logTail = tailLines(logText, limit)
          } catch {
            logTail = null
          }
          failed.push({ name: job.name, conclusion: job.conclusion, url: job.html_url ?? null, annotations: [], logTail })
        }
      } else {
        const checks = await client.request(
          'GET',
          `/repos/${repo}/commits/${encodeURIComponent(ref)}/check-runs`,
          { query: { per_page: 100 }, signal: exec.signal },
        )
        const badChecks = (checks.check_runs ?? [])
          .filter((check) => check.conclusion && !GREEN_CONCLUSIONS.has(check.conclusion))
          .slice(0, maxFailedChecks)
        for (const check of badChecks) {
          let annotations = []
          try {
            const ann = await client.request('GET', `/repos/${repo}/check-runs/${check.id}/annotations`, {
              signal: exec.signal,
            })
            annotations = (ann ?? []).map((a) => pick(a, ['path', 'start_line', 'end_line', 'level', 'message']))
          } catch {
            annotations = []
          }
          let logTail = null
          const runMatch = /\/actions\/runs\/(\d+)/.exec(check.details_url ?? '')
          if (runMatch) {
            try {
              const jobs = await client.request('GET', `/repos/${repo}/actions/runs/${runMatch[1]}/jobs`, {
                query: { per_page: 100 },
                signal: exec.signal,
              })
              const job = (jobs.jobs ?? []).find(
                (j) => j.conclusion && !GREEN_CONCLUSIONS.has(j.conclusion) && (j.name.includes(check.name) || check.name.includes(j.name)),
              )
              if (job) {
                const logText = await client.request('GET', `/repos/${repo}/actions/jobs/${job.id}/logs`, {
                  signal: exec.signal,
                })
                logTail = tailLines(logText, limit)
              }
            } catch {
              logTail = null
            }
          }
          failed.push({
            name: check.name,
            conclusion: check.conclusion,
            url: check.details_url ?? check.html_url ?? null,
            annotations,
            logTail,
          })
        }
      }

      return {
        repo,
        ref: args.runId ? `run#${args.runId}` : ref,
        run: run ? { id: run.id, name: run.name, status: run.status, conclusion: run.conclusion, url: run.html_url ?? null } : null,
        failed,
      }
    },
  }
}
