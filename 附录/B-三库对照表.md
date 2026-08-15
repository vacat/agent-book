# 附录 B 三库速查对照表

> 一张表看清 pi / dsh / codex 在同一个概念上的实现。适合读完书后随手查阅。
> 文件路径基于 2026-08 版本，可能有演进。

## 1. 总体定位

| 维度 | pi | dsh | codex |
|------|-----|-----|-------|
| 语言 | TypeScript（Bun） | TypeScript | Rust |
| 定位 | 简洁可读的 Agent 运行时 | 插件化企业级框架 | 生产级 Agent CLI |
| 仓库 | earendil-works/pi | DeepSeek Harness | openai/codex |
| 核心目录 | `packages/agent` | `packages/core/*` | `codex-rs/core/src` |
| 核心哲学 | 可读、可测 | 一切皆插件 | 稳定、安全、性能 |

## 2. 推理循环

| 概念 | pi | dsh | codex |
|------|-----|-----|-------|
| 外层（回合） | `runLoop` 外层 while | `kick()` → `turn()` | `RegularTask::run` → `run_turn` |
| 内层（步骤） | `runLoop` 内层 while | `step()` 内 while | `run_sampling_request` loop |
| 主文件 | `packages/agent/src/agent-loop.ts` | `packages/core/agent-loop/src/agent.ts` | `codex-rs/core/src/session/turn.rs` |
| 请求模型 | `streamFunction` / `Models.streamSimple` | `ctx.llm.stream(request)` | `try_run_sampling_request` |
| 判断工具调用 | `content.filter(c => c.type === "toolCall")` | `content.filter(b => b.type === 'tool-call')` | 按 ResponseItem 类型 |
| 执行工具 | `executeToolCalls`（串/并） | `executeToolCalls`（调度器+屏障） | `ToolCallRuntime` |
| 结果回传 | `messages.push(toolResult)` | `session.append` + Inbox | `record_conversation_items` |
| 回合结束 | `agent_end` 事件 | `turn/end` 日志事件 | `return last_agent_message` |

## 3. 消息与会话

| 概念 | pi | dsh | codex |
|------|-----|-----|-------|
| 消息类型 | `Message`（ai/types.ts） | `Message`（llm/message.ts） | `ResponseItem` |
| 角色 | system/user/assistant | system/user/assistant | role + item 类型 |
| 工具结果角色 | user（ToolResultMessage） | user（ToolResultMessage） | `function_call_output` |
| 会话容器 | `context.messages`（内存） | `Session` 事件日志 | `Session` 持久化 |
| 持久化 | 可选 session-backends | 核心不变量 | 内建 + 世界状态 |
| 模型输入来源 | `context.messages` | `session.deriveMessages()` | `clone_history().for_prompt()` |

## 4. 模型接入

| 概念 | pi | dsh | codex |
|------|-----|-----|-------|
| 统一接口 | `Models.streamSimple` | `LlmRuntime.stream/prepareCall` | `ModelClient` + session |
| 适配器 | `packages/ai/src/providers/*.ts` | `packages/llm/llm-<name>/` | `model-provider/` 等 |
| 模型目录 | `*.models.ts` | llm discovery | `models-manager/` |
| 重试 | 无内建 | waterfall（插件决定） | 内建状态机+退避 |
| 换模型 | 换 Model 对象 | 改配置/插件 | 改配置 |

## 5. 上下文与压缩

| 概念 | pi | dsh | codex |
|------|-----|-----|-------|
| 系统提示 | `systemPrompt` 字符串 | 分片 section + 瀑布 | 基础指令 + context items |
| 动态上下文 | transformContext 钩子 | RuntimeContextProjection | realtime_context / time_reminder |
| 压缩 | 分支总结（CLI 层） | 独立插件（maintenance） | 内建 run_auto_compact |
| token 计量 | usage-totals | token-meter | token_budget / context_window |
| 输出截断 | truncate / output-guard | tool-result-pruner | exec 输出截断 |

## 6. 扩展

| 概念 | pi | dsh | codex |
|------|-----|-----|-------|
| 插件 | 轻（工具+模式） | 重（cordis 插件+瀑布） | 中（plugins+hooks） |
| 技能 | `skills.ts` | skill 服务 + provider | `skills.rs` + 自动触发 |
| MCP | 无内建 | `packages/mcp` | `mcp.rs` + 预热/审批 |
| 工具注册 | `AgentTool` | `ctx.tools.register` | `ToolSpec` + registry |

## 7. 安全

| 概念 | pi | dsh | codex |
|------|-----|-----|-------|
| 审批 | 无内建 | interaction/user-approval | approvals.rs + guardian |
| 沙箱 | 无（容器化外包） | sandbox-policy + landlock | seatbelt/bwrap/Windows |
| 超时 | 部分 | guard 插件 | exec 超时 |
| 审计 | 无 | 会话日志 | 会话 + 世界状态 |

## 8. 各章代码速查（想去哪一章复习？）

| 我想复习… | 看哪一章 | 主要代码位置 |
|-----------|---------|-------------|
| 消息长什么样 | 第 2 章 | pi `ai/types.ts`；dsh `llm/message.ts` |
| 工具 schema | 第 3 章 | dsh `llm/types.ts` 的 `ToolSchema` |
| 统一模型接口 | 第 4 章 | pi `ai/models.ts`；dsh `llm/index.ts` |
| 推理循环骨架 | 第 5 章 | 无（伪代码） |
| pi 循环 | 第 6 章 | pi `agent/agent-loop.ts` |
| dsh 循环 | 第 7 章 | dsh `agent-loop/src/agent.ts` |
| codex 循环 | 第 8 章 | codex `session/turn.rs` |
| 系统提示组装 | 第 10 章 | dsh `system-prompt/index.ts` |
| 会话日志 | 第 11 章 | dsh `session/index.ts`、`surface.ts` |
| 插件/技能/MCP | 第 12 章 | dsh `skill/`、`mcp/`；codex `skills.rs` |
| 沙箱/审批 | 第 13 章 | codex `sandboxing/`、`approvals.rs` |
| 最小 Agent | 第 14 章 | `04-实践篇/示例/minimal-agent.ts` |
