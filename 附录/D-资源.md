# 附录 D 延伸阅读与资源

> 读完这本书之后，如果你想继续深入，这里按"方向"给你列一份资源清单。

## 1. 三库官方文档与代码

- **pi 官网**：<https://pi.dev> —— 文档、demo、API 参考。
- **pi 仓库**：<https://github.com/earendil-works/pi> —— 代码与贡献指南。
- **DeepSeek Harness（dsh）**：本仓库。先读 `docs/architecture.md`（架构总览）、
  `docs/AGENTS.md`（文档规范）、`docs/cordis-primer.md`（Cordis 入门）、
  `docs/defensive-patterns.md`（防御模式）。
- **codex 仓库**：<https://github.com/openai/codex> —— 代码、`docs/` 目录、
  `codex-rs/core/README.md`。
- **codex 官方文档**：<https://developers.openai.com/codex>

## 2. 概念与协议

- **MCP（Model Context Protocol）**：<https://modelcontextprotocol.io> —— 官方文档，
  含协议规范、SDK、示例服务器。
- **OpenAI Function Calling / Responses API**：<https://developers.openai.com/docs>
  —— 理解 `tool_calls` 字段的官方语义。
- **Anthropic Tool Use 文档**：<https://docs.anthropic.com> —— 对比各家工具调用格式。
- **ReAct 论文**：*ReAct: Synergizing Reasoning and Acting in Language Models*（arXiv）。
  了解"思考—行动"模式的原始出处（可不读原文，读总结即可）。

## 3. 推荐的"下一步"学习路径

| 你的目标 | 建议 |
|---------|------|
| 想更懂模型接入 | 读 pi 的 `packages/ai/src/providers/` 里 2–3 个 provider，对比它们的差异 |
| 想更懂插件架构 | 读 dsh 的 `docs/cordis-primer.md` + 一个插件包（如 `packages/shell/`） |
| 想更懂生产级容错 | 精读 codex 的 `turn.rs` 的压缩与重试相关段落 |
| 想更懂安全 | 读 codex 的 `sandboxing/`、`approvals.rs`、`guardian/` 的 README 与测试 |
| 想动手做产品 | 把第 14 章的代码 + 第 15 章的"保险"清单做一个真实小工具 |

## 4. 动手练习的"弹药库"

- **真实任务练习**：给第 14 章的 Agent 加 `bash` 工具，做"自动格式化并跑测试"任务。
- **读源码习惯**：给三库各挑一个"你最好奇的功能"，用书里的"骨架三问"
  （在哪一步、回合/步骤是什么、加了什么保险）去定位它的实现。
- **写测试**：参考 dsh 的 snapshot 测试思路，给第 14 章的 Agent 写一个
  "假模型回放"测试。

## 5. 代码会变，怎么保持不过时

- 本书基于 2026-08 的版本。代码会演进，**以你本地仓库和官方文档为准**；
- 学会用 `git log` 追踪三库的演进：`git log --oneline -- <文件>` 看一个文件的历史；
- 关注三库的 CHANGELOG / release notes，看"推理循环"相关改动如何演进；
- 用书里的"骨架三问"重新审视新版代码——骨架不会变，变的只是保险。

## 6. 最后的建议

Agent 技术迭代极快，但**工程本质是稳定的**：循环、工具、上下文、安全。
把这本书教你的"读代码方法论"练成肌肉记忆，你就拥有了对抗技术变化的能力。

> 祝你在 Agent 的世界里，写出让用户惊叹的作品。
