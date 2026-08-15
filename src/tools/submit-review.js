import { pick, resolveRepo } from '../github.js'

export function createSubmitReviewTool(client) {
  return {
    name: 'gh_submit_review',
    description:
      'Submit a pull request review: approve, request changes, or leave a general comment — optionally with inline comments anchored to the diff.',
    parameters: {
      repo: { type: 'string', description: 'Owner/name of the repository. Defaults to the configured repo.' },
      number: { type: 'number', required: true, description: 'Pull request number.' },
      event: {
        type: 'string',
        enum: ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'],
        required: true,
        description: 'Review event: APPROVE, REQUEST_CHANGES or COMMENT.',
      },
      body: { type: 'string', description: 'Summary of the review.' },
      comments: {
        type: 'array',
        description: 'Inline comments on the diff (each must reference a file changed in the PR).',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: { type: 'string', description: 'Relative file path in the repo.' },
            line: { type: 'number', description: 'Line number (RIGHT side of the diff by default).' },
            side: { type: 'string', enum: ['LEFT', 'RIGHT'], description: 'Which side of the diff (default RIGHT).' },
            body: { type: 'string', description: 'Comment text.' },
          },
        },
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [
        { type: 'text', text: `Submitted ${value.event} review on PR #${value.number} (${value.repo}).` },
      ],
    },
    async execute(args, exec) {
      const repo = resolveRepo(args.repo, client.defaultRepo ?? '')
      const comments = (args.comments ?? []).map((comment) => pick(comment, ['path', 'line', 'side', 'body']))
      for (const comment of comments) {
        if (!comment.path?.trim() || !comment.body?.trim()) {
          throw new Error('Each inline comment needs a non-empty `path` and `body`.')
        }
      }
      const result = await client.request('POST', `/repos/${repo}/pulls/${args.number}/reviews`, {
        body: {
          body: args.body ?? '',
          event: args.event,
          ...(comments.length ? { comments } : {}),
        },
        signal: exec.signal,
      })
      return {
        repo,
        number: args.number,
        event: args.event,
        id: result.id,
        state: result.state,
      }
    },
  }
}
