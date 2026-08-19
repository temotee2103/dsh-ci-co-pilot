# Changelog

All notable changes to `dsh-ci-co-pilot`.

> 本文件的初始版本由插件自己的 `gh_release_notes` 思路整理而成 —— 后续版本可直接用它生成（dogfooding）。

## v0.3.0 — 2026-08-19

### 🚀 Features

- `gh_list_pulls`：按 state / base / head 分支列出 PR，带年龄、标签、draft 信号
- `gh_repo_status`：一次调用拿仓库健康快照（star 数、open PR/Issue 数、最近 workflow runs）

### 🐛 Bug fixes

- API 客户端自动重试限流响应（403 rate-limit / 429），遵循 `Retry-After` / `x-ratelimit-reset`

## v0.2.0 — 2026-08-16

### 🚀 Features

- `gh_rerun_ci`：重跑 workflow run（仅失败 job 或全部）
- `gh_create_release`：把发版说明发布为 GitHub Release（自动创建 tag）
- 以 `@temotee2103/dsh-ci-co-pilot` 发布到 npm

## v0.1.0 — 2026-08-15

### 🚀 Features

- 首发：`gh_review_pr` / `gh_submit_review` / `gh_fix_ci` / `gh_triage_issues` / `gh_update_issue` / `gh_release_notes`
