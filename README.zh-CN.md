# dsh-ci-co-pilot

> 面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 GitHub CI 副驾插件。
> 一切皆插件：PR 审查、CI 失败修复、Issue 分类、自动发版说明。

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

`dsh-ci-co-pilot` 让你的 DeepSeek Harness Agent 化身 GitHub 副驾：**审查 Pull Request、排查失败的 CI、整理 Issue、起草发版说明**——全部通过 GitHub REST API 获取结构化数据，零额外运行时依赖。

## ✨ 功能

| 工具 | 作用 |
| --- | --- |
| `gh_review_pr` | 拉取 PR 的变更文件、统一 diff、已有审查和 CI 状态，Agent 据此撰写审查意见。 |
| `gh_submit_review` | 通过 / 请求变更 / 评论，支持锚定在 diff 上的行内评论。 |
| `gh_fix_ci` | 按 commit、分支或 workflow run 查看失败检查、注解和日志尾部。 |
| `gh_triage_issues` | 列出 Issue 及分类信号：年龄、是否陈旧、评论数、标签。 |
| `gh_update_issue` | 设置标签、指派、评论、里程碑、关闭/重开。 |
| `gh_release_notes` | 按标签或 Conventional Commit 前缀，把合并的 PR 分组生成发版说明。 |
| `gh_rerun_ci` | 重跑 workflow run——仅失败 job 或全部（修复后验证）。 |
| `gh_create_release` | 把发版说明发布为 GitHub Release（自动创建 tag）。 |

## 🚀 安装

```bash
# 从 npm 安装（推荐）
dsh plugin --profile web add @temotee2103/dsh-ci-co-pilot

# 从 GitHub 直接安装（零构建步骤，装完即用）
dsh plugin --profile web add github:temotee2103/dsh-ci-co-pilot

# 或通过社区索引安装（国内镜像 + sha256 校验）
xlings install dsh:dsh-ci-co-pilot -y
```

> 提示：可固定 commit 以复现安装：`dsh plugin --profile web add github:temotee2103/dsh-ci-co-pilot#<40位sha>`

## 🔑 认证

公开仓库无需 Token（受 GitHub 匿名限流）。私有仓库或高频使用：

```bash
export GITHUB_TOKEN=github_pat_...   # 或 GH_TOKEN
```

也可以在 profile 的 `cordis.patch.yml` 里配置默认仓库与 API 地址（支持 GitHub Enterprise Server）。

## 💬 用法示例

- **审查 PR**：`审查 deepseek-ai/deepseek-harness 的 PR #42，重点看并发问题，给出具体修改建议并提交审查。`
- **修复 CI**：`main 分支 CI 红了，找到失败原因并修复，然后推送。`
- **整理 Issue**：`整理本仓库的 open issues：给未打标签的补标签，关闭过期的重复项。`
- **发版说明**：`基于上一次 release 生成发版说明并保存到 CHANGELOG.md。`

## 🧑‍💻 开发

```bash
pnpm install
pnpm test     # vitest + mock fetch，无需网络与 API key
pnpm check
```

插件是纯 ESM JavaScript，**无构建步骤**，`dsh plugin add github:...` 安装后立即可用。

## 📄 License

MIT © [temotee2103](https://github.com/temotee2103)
