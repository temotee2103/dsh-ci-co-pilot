# dsh-ci-co-pilot

> GitHub CI co-pilot for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).
> Everything is a plugin: PR review, CI failure fixing, issue triage, and release notes.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-blue)](package.json)
[![dsh-plugin](https://img.shields.io/badge/topic-dsh--plugin-orange)](https://github.com/topics/dsh-plugin)

`dsh-ci-co-pilot` turns your DeepSeek Harness agent into a GitHub co-pilot that can **review pull requests, debug failing CI, triage issues and draft release notes** — all with structured data from the GitHub REST API, and zero extra runtime dependencies.

## ✨ Features

| Tool | What it does |
| --- | --- |
| `gh_review_pr` | Pull a PR with its changed files, unified diff, existing reviews and CI status — the agent then writes the review. |
| `gh_submit_review` | Approve, request changes, comment — with optional inline comments anchored to the diff. |
| `gh_fix_ci` | Inspect failing checks/annotations/log tails for a commit, branch or workflow run. |
| `gh_triage_issues` | List issues with triage signals: age, staleness, comments, labels. |
| `gh_update_issue` | Set labels, assign, comment, set milestone, close/reopen. |
| `gh_release_notes` | Generate grouped release notes from PRs merged since the last release, a tag, or a date. |
| `gh_rerun_ci` | Rerun a workflow run — failed jobs only, or everything (verify a fix). |
| `gh_create_release` | Publish release notes as a GitHub release (creates the tag too). |

## 🚀 Install

```bash
# from npm (recommended)
dsh plugin --profile web add @temotee2103/dsh-ci-co-pilot

# from GitHub (zero build step — works immediately)
dsh plugin --profile web add github:temotee2103/dsh-ci-co-pilot

# or via the community index (CN mirror + sha256 check)
xlings install dsh:dsh-ci-co-pilot -y
```

Then restart your Harness session (or start `dsh web`).

> Tip: pin a commit for reproducible installs:
> `dsh plugin --profile web add github:temotee2103/dsh-ci-co-pilot#<40-hex-sha>`

## 🔑 Authentication

Public repos work without a token (GitHub's unauthenticated rate limit applies). For private repos and heavier usage:

```bash
# any of these is read by the plugin at startup
export GITHUB_TOKEN=github_pat_...
export GH_TOKEN=...            # gh CLI style
```

You can also set a default repo and API base in your profile's `cordis.patch.yml`:

```yaml
- id: ci-co-pilot
  name: '@dsh-external/dsh-ci-co-pilot'
  config:
    repo: myorg/myrepo
    apiBase: https://github.example.com/api/v3   # GitHub Enterprise Server
```

## 💬 Usage examples

Ask your agent things like:

- **Review a PR**
  > Review PR #42 in `deepseek-ai/deepseek-harness`. Focus on race conditions and suggest concrete fixes, then submit a review.

- **Fix failing CI**
  > CI is red on `main`. Find the failures and fix them, then push.

- **Triage issues**
  > Triage the open issues in this repo: label the unlabeled ones, close stale duplicates, and leave a comment on the top 3 by comments.

- **Release notes**
  > Draft release notes since the last release and save them to `CHANGELOG.md`.

## ⚙️ Configuration

All knobs are validated config values you can override from your profile's `cordis.patch.yml` (see the defaults in [`cordis.patch.yml`](cordis.patch.yml)): `review.maxFiles`, `review.maxDiffChars`, `ci.maxLogLines`, `ci.maxFailedChecks`, `triage.perPage`, `triage.staleDays`, `release.perPage`.

## 🧑‍💻 Development

```bash
pnpm install
pnpm test        # vitest, mocked fetch — no network, no API key
pnpm check       # syntax checks + tests
```

## 🧩 How it works

`dsh-ci-co-pilot` is a standard Cordis bundle for DeepSeek Harness:

- `cordis.patch.yml` — the bundle layer that mounts the plugin row.
- `index.js` — plugin entry: registers the six tools on the `tools` service.
- `src/github.js` — a tiny fetch-based GitHub REST client (auth header, pagination, error mapping, `AbortSignal`).
- `src/tools/*` — one module per tool, returning structured canonical values; `src/format.js` renders them to model-facing markdown.

The plugin ships plain ESM JavaScript — no build step, so `dsh plugin add github:...` installs and runs immediately.

## 📄 License

MIT © [temotee2103](https://github.com/temotee2103)
