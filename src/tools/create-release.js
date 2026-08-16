import { resolveRepo } from '../github.js'

export function createCreateReleaseTool(client) {
  return {
    name: 'gh_create_release',
    description:
      'Create a GitHub release (tag + notes). Pairs with gh_release_notes: generate the notes first, then publish them as a release. Creates the tag if it does not exist yet.',
    parameters: {
      repo: { type: 'string', description: 'Owner/name of the repository. Defaults to the configured repo.' },
      tag: { type: 'string', required: true, description: 'Tag name, e.g. "v0.2.0". Created at `target` if missing.' },
      name: { type: 'string', description: 'Release title (defaults to the tag name).' },
      body: { type: 'string', description: 'Release notes in Markdown.' },
      target: { type: 'string', description: 'Commit SHA or branch the tag points at (defaults to the default branch).' },
      draft: { type: 'boolean', description: 'Create as a draft (default false).' },
      prerelease: { type: 'boolean', description: 'Mark as pre-release (default false).' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [
        { type: 'text', text: `Released ${value.tag} on ${value.repo}: ${value.htmlUrl}` },
      ],
    },
    async execute(args, exec) {
      const repo = resolveRepo(args.repo, client.defaultRepo ?? '')
      const result = await client.request('POST', `/repos/${repo}/releases`, {
        body: {
          tag_name: args.tag,
          name: args.name || args.tag,
          body: args.body ?? '',
          ...(args.target ? { target_commitish: args.target } : {}),
          draft: args.draft ?? false,
          prerelease: args.prerelease ?? false,
        },
        signal: exec.signal,
      })
      return {
        repo,
        tag: result.tag_name,
        name: result.name,
        id: result.id,
        draft: result.draft,
        prerelease: result.prerelease,
        htmlUrl: result.html_url ?? null,
      }
    },
  }
}
