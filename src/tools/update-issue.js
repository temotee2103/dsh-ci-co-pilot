import { pick, resolveRepo } from '../github.js'

export function createUpdateIssueTool(client) {
  return {
    name: 'gh_update_issue',
    description:
      'Update an issue or pull request: set labels, assign users, post a comment, set a milestone, or change state (close/reopen).',
    parameters: {
      repo: { type: 'string', description: 'Owner/name of the repository. Defaults to the configured repo.' },
      number: { type: 'number', required: true, description: 'Issue or PR number.' },
      action: {
        type: 'string',
        enum: ['label', 'assign', 'comment', 'close', 'reopen', 'milestone'],
        required: true,
        description: 'What to do.',
      },
      labels: { type: 'array', items: { type: 'string' }, description: 'Labels to set, replacing existing ones (action=label).' },
      addLabels: { type: 'array', items: { type: 'string' }, description: 'Labels to add without removing existing ones (action=label).' },
      assignees: { type: 'array', items: { type: 'string' }, description: 'Users to assign (action=assign).' },
      comment: { type: 'string', description: 'Comment body (action=comment).' },
      milestone: { type: 'string', description: 'Milestone number or title to set, or "none" to clear (action=milestone).' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [
        { type: 'text', text: `Applied action "${value.action}" to #${value.number} (${value.repo}).` },
      ],
    },
    async execute(args, exec) {
      const repo = resolveRepo(args.repo, client.defaultRepo ?? '')
      let patch = {}
      let comment = null

      switch (args.action) {
        case 'label':
          if (args.labels) {
            patch.labels = args.labels
          } else if (args.addLabels) {
            const current = await client.request('GET', `/repos/${repo}/issues/${args.number}`, { signal: exec.signal })
            const existing = (current.labels ?? []).map((label) => (typeof label === 'string' ? label : label.name))
            patch.labels = [...new Set([...existing, ...args.addLabels])]
          } else {
            throw new Error('action=label requires `labels` (replace) or `addLabels` (append).')
          }
          break
        case 'assign':
          patch.assignees = args.assignees ?? []
          break
        case 'close':
          patch.state = 'closed'
          break
        case 'reopen':
          patch.state = 'open'
          break
        case 'milestone':
          patch.milestone = args.milestone === undefined || args.milestone === 'none' ? null : Number(args.milestone) || args.milestone
          break
        case 'comment':
          if (!args.comment?.trim()) throw new Error('action=comment requires `comment`.')
          comment = args.comment
          break
        default:
          throw new Error(`Unknown action: ${args.action}`)
      }

      let updated = null
      if (Object.keys(patch).length > 0) {
        updated = await client.request('PATCH', `/repos/${repo}/issues/${args.number}`, {
          body: patch,
          signal: exec.signal,
        })
      }
      let commentId = null
      if (comment) {
        const posted = await client.request('POST', `/repos/${repo}/issues/${args.number}/comments`, {
          body: { body: comment },
          signal: exec.signal,
        })
        commentId = posted.id
      }

      return {
        repo,
        number: args.number,
        action: args.action,
        updated: updated
          ? pick(updated, ['state', 'labels', 'assignees', 'milestone', 'updated_at'])
          : null,
        commentId,
      }
    },
  }
}
