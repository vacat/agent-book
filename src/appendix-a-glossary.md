# 附录 A 术语表

> 按拼音/字母排序。每个词给出"一句话通俗解释" + "三库里的对应物"。
> 括号里的数字是首次详述的章节。

## A

**Agent（智能体）**
一个能自主完成任务的程序 = 大模型 + 推理循环 + 工具。（第 1 章）

**Agent Loop（推理循环 / Agent 循环）**
Agent 的核心机制："思考—行动—观察"的循环，直到任务完成。（第 5 章）

**Adapter（适配器）**
把"统一接口"翻译成某家模型 API 格式的代码。pi 的 `providers/*.ts`、dsh 的
`llm-<name>` 包都是适配器。（第 4 章）

**Append-only log（追加式日志）**
只追加、不修改的历史记录。dsh 会话的基础。（第 11 章）

**Approval（审批）**
高风险操作在执行前请求用户确认的机制。codex 的 `tools/approvals.rs`。（第 13 章）

**Assistant message（助手消息）**
Agent 自己输出的消息，可能包含工具调用块。（第 2 章）

## B

**Block / Content block（内容块）**
消息内容的构成单元，可能是文本、思考、工具调用等。pi 的 `AssistantContentPart`、
dsh 的 `ContentBlock`。（第 2 章）

## C

**Capability seam（能力接缝）**
dsh 的架构概念：一个能力 = 服务定义 + 服务提供者 + 消费者 三种角色。
（第 4、12 章）

**Compaction（压缩）**
把过长的历史让模型总结成摘要，腾出上下文空间。codex 的 `run_auto_compact`。（第 10 章）

**Context（上下文）**
每次请求发给模型的全部信息：系统提示 + 历史消息 + 工具清单。（第 2 章）

**Context Window（上下文窗口）**
模型单次能处理的输入上限，Agent 工程的硬约束。（第 10 章）

**Consumer（消费者）**
能力接缝中"使用能力"的一方，如 agent-loop 调用 `ctx.llm.stream`。（第 4 章）

## E

**Event sourcing（事件溯源）**
以"事件日志"为唯一真相源、其他状态由日志派生的设计。dsh 会话的核心。（第 11 章）

**EventStream / AgentEvent（事件流 / 事件）**
Agent 运行时对外广播状态变化的消息。pi 的 `emit(...)`。（第 6 章）

## F

**Function Calling（函数调用 / 工具调用）**
模型按工具 schema 输出"我要调用某函数、参数是什么"的机制。（第 3 章）

## H

**Hook（钩子）**
在特定时机（回合开始/停止、采样前后）执行的扩展代码。codex 大量使用。（第 8、12 章）

## I

**Inbox（收件箱）**
dsh 中管理消息投递位置（下一回合/下一步）与唤醒的组件。（第 7 章）

## L

**LLM（大语言模型）**
本书当作"黑盒 API"使用的模型。我们只关心它的输入输出接口。（第 1 章）

## M

**MCP（Model Context Protocol，模型上下文协议）**
让 Agent 以标准化方式连接外部系统的开放协议。可理解为"Agent 世界的 USB-C"。（第 12 章）

**Message（消息）**
对话记录的单元，有 role（system/user/assistant）。（第 2 章）

**Model-visible ⟺ logged（模型可见 ⟺ 可记录）**
dsh 的核心不变量：任何模型看到的信息都必须能从会话日志重建。（第 11 章）

## P

**Parallel / Sequential tool calls（并行 / 串行工具调用）**
多个工具同时执行 / 一个接一个执行。dsh、pi 都支持，且并行也要按模型顺序返回。
（第 3 章）

**Plugin（插件）**
扩展框架能力的模块。dsh 的"一切皆插件"、codex 的 plugins/hooks。（第 12 章）

**Prompt（提示词）**
发给模型的文本指令，包括系统提示、用户消息等。（第 2、10 章）

## R

**ReAct（Reason + Act）**
"思考 + 行动"的推理模式，Agent 循环的理论基础。（第 5 章）

**Role（角色）**
消息的说话方：system / user / assistant。（第 2 章）

## S

**Sandbox（沙箱）**
限制 Agent 执行能力的隔离环境（文件、进程、网络）。codex 的 seatbelt/bwrap。（第 13 章）

**Schema（工具描述 / 说明书）**
描述工具的名称、用途、参数格式的 JSON Schema。模型据此学习调用工具。（第 3 章）

**Session（会话）**
Agent 的记忆容器。pi 是内存数组，dsh/codex 是持久化日志。（第 2、11 章）

**Skill（技能）**
给模型看的"文档型知识"（如 SKILL.md、AGENTS.md），注入系统提示词。（第 12 章）

**Step（步骤）**
回合内的一次"思考—行动—观察"小循环。（第 5 章）

**Streaming（流式）**
模型逐块输出而非一次性返回，让 Agent 能边生成边行动。（第 4 章）

**System Prompt（系统提示词）**
消息里优先级最高、通常是"出厂设置"的那段指令。（第 10 章）

## T

**Tool（工具）**
Agent 能调用的函数 = schema + execute。（第 3 章）

**Tool Call（工具调用）**
模型输出中"我要调用某工具"的块，含 id/name/arguments（JSON 字符串）。（第 3 章）

**Turn（回合）**
从一条用户消息到最终回答的整个过程，包含多个步骤。（第 5 章）

**TurnEndReason（回合结束原因）**
dsh 记录"回合为什么结束"的结构化字段（completed/max-tokens/error/aborted...）。（第 7 章）

## W

**Waterfall（瀑布）**
一种"可被监听者短路或改写"的事件机制。dsh 用它对插件开放决策点。
铁律：调用 `next()` 才会继续。（第 7、12 章）

**World state（世界状态）**
codex 追踪的文件系统/环境/终端当前状态，用于压缩重建与 diff 展示。（第 8、11 章）
