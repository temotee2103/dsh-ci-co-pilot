# 让 DeepSeek Harness 自己会审 PR、修 CI、发版：dsh-ci-co-pilot 开源了

DeepSeek Harness（DSH）是 DeepSeek 官方开源的 Agent 运行框架，核心理念是"一切皆插件"——模型、工具、会话、调度、UI 全部由插件提供。开源当天 GitHub Star 冲到 8 万（据社区报道），插件生态也在快速膨胀。

模型负责思考，Harness 负责把模型接进文件系统、终端、浏览器。但大多数 Agent 默认够不着 GitHub 的日常流程：审 PR、看 CI 失败原因、整理 issue、写发版说明。这些高频操作要么靠人肉点网页，要么靠零散的脚本。

我写了一个开源插件 **dsh-ci-co-pilot**，让 DSH Agent 变成真正的 GitHub 副驾，覆盖从"发现问题"到"发布上线"的完整链路。

## 八个工具

| 工具 | 作用 |
| --- | --- |
| `gh_review_pr` | 拉取 PR 的变更文件、统一 diff、已有审查和 CI 状态 |
| `gh_submit_review` | 提交审查：通过 / 请求修改 / 评论，支持行内注释 |
| `gh_fix_ci` | 定位失败的检查、错误注解和日志尾部 |
| `gh_rerun_ci` | 重跑 workflow run，仅失败 job 或全部 |
| `gh_triage_issues` | 列出 issue 及分类信号：年龄、陈旧度、评论数、标签 |
| `gh_update_issue` | 打标签、指派、评论、里程碑、关闭重开 |
| `gh_release_notes` | 按标签或 Conventional Commit 把合并的 PR 分组生成发版说明 |
| `gh_create_release` | 把发版说明发布为 GitHub Release，自动建 tag |

## 安装

```bash
# 从 npm 安装
dsh plugin --profile web add @temotee2103/dsh-ci-co-pilot

# 或从 GitHub 直接装（零构建，装完即用）
dsh plugin --profile web add github:temotee2103/dsh-ci-co-pilot

# 或通过社区索引（国内镜像 + sha256 校验）
xlings install dsh:dsh-ci-co-pilot -y
```

公开仓库无需 Token；私有仓库设置环境变量 `GITHUB_TOKEN`（或 `GH_TOKEN`）即可。

## 四个实战场景

**审 PR**

```
审查 deepseek-ai/deepseek-harness 的 PR #42，重点看并发问题，
给出具体修改建议，然后提交审查。
```

Agent 会调 `gh_review_pr` 拉回文件清单、diff、已有评论和 CI 状态，读完直接给出行内级意见，再用 `gh_submit_review` 提交。

**修 CI**

```
main 分支 CI 红了，找到失败原因并修复，然后重跑验证。
```

`gh_fix_ci` 把失败检查、报错注解、日志尾部带回来，模型分析后用自己的编辑工具改代码，推送后再用 `gh_rerun_ci` 验证。修 → 验的循环不需要离开对话。

**整理 Issue**

```
整理 open issues：给没标签的补标签，标记过期的重复项，给讨论最热的三条写个跟进评论。
```

`gh_triage_issues` 返回年龄、评论数、标签等信号，模型判断后逐条执行 `gh_update_issue`。

**发版**

```
基于上一次 release 生成发版说明，然后直接发布 v0.2.0。
```

`gh_release_notes` 把合并的 PR 按 breaking / feature / fix / docs 分组，`gh_create_release` 一条命令建 tag + 发 Release。这个插件的 CHANGELOG 就是它自己生成的。

## 设计取舍

**数据与思考分离。** 工具只负责取数和执行，判断全部交给模型。插件本身不内置任何"审查规则"，但可以随时读仓库的 CONTRIBUTING 让审查贴合项目风格。

**零构建。** 纯 ESM JavaScript，没有 build 步骤，git 或 npm 安装后立刻可用，不需要给 pnpm 授权执行 prepare 脚本。

**零运行时依赖。** GitHub 请求直接用内置 fetch，支持 AbortSignal；peer 依赖（`dsh-tools`、`cordis`）由 Harness 运行时提供，不污染依赖树。

**可配置。** diff 截断长度、日志尾部行数、issue 陈旧阈值都可以在 profile 配置里覆盖。

## 开源与下一步

MIT 协议，代码、测试、文档全公开；42 个单测全绿，插件仓库自己的 GitHub Actions CI 也是绿的。已提交官方插件索引 dsh-index（PR #36，等待合并），合并后支持按名安装和国内镜像加速。

下一步计划：组合成开箱即用的完整 Agent（agent-ci-co-pilot，自动定时审 PR + CI 失败通知）、抽象 VCS 层支持 GitLab / Gitee、把团队审查规范注入提示词。

欢迎 star、提 issue，或者装好后直接让它帮你审一个 PR 试试——好用不好用，一试便知。

- 仓库：https://github.com/temotee2103/dsh-ci-co-pilot
- npm：https://www.npmjs.com/package/@temotee2103/dsh-ci-co-pilot
- 索引 PR：https://github.com/Sunrisepeak/dsh-index/pull/36
