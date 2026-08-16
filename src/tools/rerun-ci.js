import { resolveRepo } from '../github.js'

export function createRerunCiTool(client) {
  return {
    name: 'gh_rerun_ci',
    description:
      'Rerun a GitHub Actions workflow run — all jobs or only the failed ones. Use after fixing the code with gh_fix_ci to verify the fix.',
    parameters: {
      repo: { type: 'string', description: 'Owner/name of the repository. Defaults to the configured repo.' },
      runId: { type: 'number', required: true, description: 'The Actions workflow run id to rerun.' },
      failedOnly: { type: 'boolean', description: 'Rerun only the failed jobs (default true).' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [
        {
          type: 'text',
          text: `Triggered rerun of workflow run #${value.runId} (${value.mode}) on ${value.repo}.`,
        },
      ],
    },
    async execute(args, exec) {
      const repo = resolveRepo(args.repo, client.defaultRepo ?? '')
      const failedOnly = args.failedOnly !== false
      const path = failedOnly
        ? `/repos/${repo}/actions/runs/${args.runId}/rerun-failed-jobs`
        : `/repos/${repo}/actions/runs/${args.runId}/rerun`
      await client.request('POST', path, { signal: exec.signal })
      return {
        repo,
        runId: args.runId,
        mode: failedOnly ? 'failed-jobs' : 'all-jobs',
        reran: true,
      }
    },
  }
}
