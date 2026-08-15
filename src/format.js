// Model-facing markdown renderers.
// Pure functions of the canonical tool values: no I/O, no clock, no session state.

function prChecksMarkdown(checks) {
  if (!checks) return ''
  const lines = [`\n### CI status (${checks.total} checks, ${checks.failed.length} failing)`]
  if (checks.failed.length === 0) lines.push('- ✅ All checks green')
  for (const check of checks.failed) lines.push(`- ❌ \`${check.name}\` — ${check.conclusion}`)
  return lines.join('\n')
}

export function reviewPrMarkdown(value) {
  const { repo, number, pr, files, reviews, checks, diff } = value
  const lines = []
  lines.push(`## PR #${number} · ${repo}`)
  lines.push(`**${pr.title}** (${pr.state}${pr.merged ? ', merged' : ''}) by @${pr.author ?? 'unknown'}`)
  lines.push(`\`${pr.base}\` ← \`${pr.head}\` · commit \`${pr.sha?.slice(0, 7)}\``)
  lines.push(`+${pr.additions} −${pr.deletions} across ${pr.changedFiles} files · created ${pr.createdAt ?? 'unknown'}`)
  if (pr.body) lines.push(`\n> ${pr.body}`)
  if (files.length) {
    lines.push('\n### Changed files')
    for (const file of files) {
      lines.push(`- \`${file.path}\` (${file.status}) +${file.additions} −${file.deletions}`)
    }
  }
  if (reviews.length) {
    lines.push('\n### Existing reviews')
    for (const review of reviews) {
      lines.push(`- @${review.author ?? 'unknown'}: **${review.state}**${review.body ? ` — ${review.body}` : ''}`)
    }
  }
  lines.push(prChecksMarkdown(checks))
  if (diff) {
    lines.push(`\n### Unified diff (truncated)\n\`\`\`diff\n${diff}\n\`\`\``)
  }
  return lines.join('\n')
}

export function fixCiMarkdown(value) {
  const { repo, ref, run, failed } = value
  const lines = []
  lines.push(`## CI failures · ${repo} @ ${ref}`)
  if (run) lines.push(`Workflow run #${run.id} \`${run.name}\` — ${run.conclusion}`)
  if (failed.length === 0) {
    lines.push('\n✅ No failing checks found.')
    return lines.join('\n')
  }
  for (const item of failed) {
    lines.push(`\n### ❌ ${item.name} (${item.conclusion})`)
    if (item.url) lines.push(`URL: ${item.url}`)
    if (item.annotations?.length) {
      lines.push('Annotations:')
      for (const annotation of item.annotations) {
        const at = annotation.path ? `${annotation.path}${annotation.start_line ? `:${annotation.start_line}` : ''}` : ''
        lines.push(`- ${at ? `\`${at}\`` : ''} ${annotation.message}`)
      }
    }
    if (item.logTail) {
      lines.push(`Log tail:\n\`\`\`console\n${item.logTail}\n\`\`\``)
    }
  }
  return lines.join('\n')
}

export function triageMarkdown(value) {
  const { repo, total, stale, needsTriage, issues } = value
  const lines = []
  lines.push(`## Issue triage · ${repo}`)
  lines.push(`${total} issues · ${stale} stale · ${needsTriage} awaiting triage`)
  if (issues.length === 0) {
    lines.push('\nNo issues match the filter.')
    return lines.join('\n')
  }
  for (const issue of issues) {
    const flags = []
    if (issue.stale) flags.push('stale')
    if (issue.needsTriage) flags.push('needs-triage')
    lines.push(
      `- #${issue.number} ${issue.title} · @${issue.author ?? 'unknown'} · ${issue.daysOpen}d` +
        ` · ${issue.comments} comments · [${issue.labels.join(', ') || 'no labels'}]` +
        (flags.length ? ` · ⚠️ ${flags.join(', ')}` : ''),
    )
  }
  return lines.join('\n')
}

export function categorize(pr, labels) {
  const set = new Set((labels ?? []).map((label) => label.toLowerCase()))
  if (set.has('breaking') || set.has('major')) return 'breaking'
  if (set.has('enhancement') || set.has('feature') || set.has('feat')) return 'features'
  if (set.has('bug') || set.has('fix')) return 'fixes'
  if (set.has('docs') || set.has('documentation')) return 'docs'
  if (set.has('dependencies') || set.has('deps')) return 'dependencies'
  const match = /^(feat|fix|docs|chore|refactor|perf|test|build|ci|style|breaking)(\(.*\))?!?:/.exec(pr.title ?? '')
  if (match) {
    if (match[1] === 'feat') return 'features'
    if (match[1] === 'fix') return 'fixes'
    if (match[1] === 'docs') return 'docs'
    if (match[1] === 'chore' || match[1] === 'build' || match[1] === 'ci') return 'chores'
    return 'other'
  }
  return 'other'
}

export function releaseNotesMarkdown(value) {
  const { repo, from, to, sections } = value
  const lines = []
  lines.push(`# Release notes · ${repo}`)
  lines.push(`\`${from}\` → \`${to}\`\n`)
  if (!sections.breaking.length && !sections.features.length && !sections.fixes.length) {
    lines.push('_No merged PRs in this range._')
    return lines.join('\n')
  }
  const blocks = [
    ['⚠️ Breaking changes', sections.breaking],
    ['🚀 Features', sections.features],
    ['🐛 Bug fixes', sections.fixes],
    ['📚 Documentation', sections.docs],
    ['🔗 Dependencies', sections.dependencies],
    ['🧹 Chores', sections.chores],
    ['Others', sections.other],
  ]
  for (const [title, items] of blocks) {
    if (!items.length) continue
    lines.push(`\n## ${title}`)
    for (const item of items) {
      lines.push(`- ${item.title} (#${item.number})`)
    }
  }
  return lines.join('\n')
}
