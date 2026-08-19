import { defineTool } from '@deepseek-ai/dsh-tools'
import { createClient } from './src/github.js'
import { createReviewPrTool } from './src/tools/review-pr.js'
import { createSubmitReviewTool } from './src/tools/submit-review.js'
import { createFixCiTool } from './src/tools/fix-ci.js'
import { createTriageIssuesTool } from './src/tools/triage-issues.js'
import { createUpdateIssueTool } from './src/tools/update-issue.js'
import { createReleaseNotesTool } from './src/tools/release-notes.js'
import { createRerunCiTool } from './src/tools/rerun-ci.js'
import { createCreateReleaseTool } from './src/tools/create-release.js'
import { createListPullsTool } from './src/tools/list-pulls.js'
import { createRepoStatusTool } from './src/tools/repo-status.js'

export const name = 'ci-co-pilot'
export const inject = ['tools']

function normalizeConfig(config = {}) {
  return {
    repo: config.repo ?? '',
    apiBase: config.apiBase ?? 'https://api.github.com',
    review: {
      maxFiles: config.review?.maxFiles ?? 50,
      maxDiffChars: config.review?.maxDiffChars ?? 20000,
    },
    ci: {
      maxLogLines: config.ci?.maxLogLines ?? 400,
      maxFailedChecks: config.ci?.maxFailedChecks ?? 10,
    },
    triage: {
      perPage: config.triage?.perPage ?? 50,
      staleDays: config.triage?.staleDays ?? 30,
    },
    release: {
      perPage: config.release?.perPage ?? 100,
    },
    pulls: {
      limit: config.pulls?.limit ?? 30,
    },
    status: {
      runs: config.status?.runs ?? 10,
    },
  }
}

export function apply(ctx, inputConfig = {}) {
  const config = normalizeConfig(inputConfig)
  const token = inputConfig.token || process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  const client = createClient({ token, baseUrl: config.apiBase })
  client.defaultRepo = config.repo

  const tools = [
    createReviewPrTool(client, config.review),
    createSubmitReviewTool(client),
    createFixCiTool(client, config.ci),
    createTriageIssuesTool(client, config.triage),
    createUpdateIssueTool(client),
    createReleaseNotesTool(client, config.release),
    createRerunCiTool(client),
    createCreateReleaseTool(client),
    createListPullsTool(client, config.pulls),
    createRepoStatusTool(client, config.status),
  ]
  for (const tool of tools) {
    ctx.tools.register(defineTool(tool))
  }
}
