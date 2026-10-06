# 第 7 章 代码精读（二）：dsh 的回合与步骤

> **本章目标**
> 1. 逐行读懂 dsh 的推理循环（`packages/core/agent-loop/src/agent.ts`）；
> 2. 掌握 dsh 的"状态机 + 会话日志"设计；
> 3. 看懂 turn/step 两层循环、preStep 瀑布、请求冻结；
> 4. 对比 pi 与 dsh 的实现差异，理解"工程化"具体加了什么。

> **阅读前提**：请先读第 5、6 章。dsh 的循环比 pi 复杂，但它依然是
> 第 5 章那个骨架的"工程化升级版"。读的时候**始终回到骨架**。

## 7.1 先建立整体地图

dsh 的推理循环在 `packages/core/agent-loop/src/agent.ts`（约 690 行），
主角是一个类 `ReactLoopAgent`（第 98 行）。它的核心方法：

| 方法 | 行号 | 作用 |
|------|------|------|
| `kick()` | 252 | 驱动器入口：`while (await this.turn()) {}` |
| `preStep()` | 267 | 打开一个步骤：取消息、组装系统提示、走 waterfall |
| `turn()` | 296 | 一个回合（回合级循环） |
| `step()` | 398 | 一个步骤：请求模型、处理输出、执行工具（步骤级循环） |
| `prepareRequest()` | 547 | 解析请求配置并绑定适配器 |
| `buildRequest()` | 599 | 构造并"冻结"一个模型请求 |

dsh 有四个与 pi 显著不同的点，读完本章你会明白为什么它们存在：

1. **状态机**：Agent 有一个 `phase`（阶段）状态，只有三种：
   `idle`（空闲）/ `maintenance`（维护）/ `running`（运行中）；
2. **会话日志（Session）**：每一件事都 append 成事件（`turn/start`、`step/start`、
   `user/message`、`assistant/message`……），**模型看到的一切都能从日志重建**；
3. **收件箱（Inbox）**：用户消息不是直接 push，而是先进一个"收件箱"，
   在合适的时间点（回合边界/步骤边界）被领取；
4. **瀑布（waterfall）**：关键决策点（pre-step、request）都开放给插件拦截。

## 7.2 状态机：Agent 的"当前状态"（phase）

先看 `phase` 的定义（第 42–49 行）：

```ts
// packages/core/agent-loop/src/agent.ts 第 42–49 行
type Phase =
  | { kind: 'idle'; lastTurn: number }                          // 空闲
  | {
    kind: 'maintenance'                                         // 维护（例如压缩）
    abort: AbortController
    lastTurn: number
    wakeRequested: boolean
  }
  | { kind: 'running'; abort: AbortController; turn: number; step: number; wakeRequested: boolean }
```

为什么要状态机？因为 Agent 的"运行"和"空闲"不是简单的开关——它可能被
多条消息唤醒、可能中途做维护（如上下文压缩）、可能被取消。用显式状态，
能清晰回答"现在能不能接收新消息？""当前正在哪个回合第几步？""取消会怎样？"

状态迁移用 `setPhase`（第 145 行）统一管理，并且在状态改变时对外发
`agent/status` 事件。**任何外部订阅者（UI、监控）都可以看到 Agent 状态的每次变化。**

## 7.3 驱动器入口：kick()（第 252–265 行）

```ts
// 第 252–265 行
private async kick(): Promise<void> {
	try {
		while (await this.turn()) {}          // 254：连续处理回合，直到 turn() 返回 false
	} catch (_error) {
		// Reported failures and cancellation are contained at the driver boundary.
	} finally {
		if (this.phase.kind === 'running') {    // 259
			const { turn, wakeRequested } = this.phase
			this.setPhase({ kind: 'idle', lastTurn: turn })   // 261：回到空闲
			if (wakeRequested && this.inbox.hasPending) this.wakeDriver()  // 262：有等待唤醒的消息则再开
		}
	}
}
```

- **第 254 行**：`turn()` 每次处理一个回合，返回 `boolean` 表示"是否还有下一回合"。
  这个 `while` 就是"回合级循环"——和 pi 的外层 `while(true)` 异曲同工。
- **第 256 行**：`catch` 故意**吞掉错误**（注释说"失败在驱动边界被收容"）——
  因为错误已经在 `throwError` 里通过事件报告过了，这里不必再抛。
- **第 261 行**：无论正常还是异常，最后回到 `idle`。
- **第 262 行**：如果运行期间有人"要求唤醒"（`wakeRequested`）且收件箱里还有
  待处理消息，就再启动一个驱动器。这实现了"排队中的消息自动续跑"。

## 7.4 一个回合：turn()（第 296–396 行）

### 7.4.1 回合开头（296–311 行）

```ts
// 第 296–311 行（节选）
const phase = this.phase
const { signal } = phase.abort
signal.throwIfAborted()                      // 302：先检查是否已被取消
const turn = phase.turn + 1                  // 303：回合号 +1
try {
	this.session.append('turn/start', { turn })  // 305：写会话日志
} catch (error: unknown) {
	this.throwError(error)
}
phase.turn = turn
let turnEnds: TurnEndReason | null = null    // 310：回合结束原因
let target: InboxTarget = 'next-turn'        // 311：本回合首个步骤从哪取消息
```

- **第 302 行**：`signal.throwIfAborted()`——**每一步都检查中止信号**，这是
  dsh 贯穿全循环的防御习惯：随时可能被取消，取消就立刻停。
- **第 305 行**：`session.append('turn/start', ...)`——把"回合开始"记入会话日志。
  这是 dsh 与 pi 最大的不同：**pi 的 `context.messages` 是内存数组，
  dsh 的 `Session` 是一份持久化事件日志**。后面第 11 章详述。
- **第 310 行**：`turnEnds` 记录"为什么回合结束"（completed/max-tokens/error/aborted/
  blocked……），最后会写进日志。
- **第 311 行**：`target` 表示本回合从收件箱的哪个位置取消息：首步是
  `'next-turn'`（新回合的消息），后续步骤是 `'next-step'`（工具结果等）。

### 7.4.2 回合主循环（313–364 行）

```ts
// 第 313–364 行（节选，含注释精简）
while (true) {
	signal.throwIfAborted()
	const step = phase.step + 1                             // 315：步骤号 +1
	const decision = await this.preStep(target, { turn, step })  // 316：准备这一步
	if (decision.kind === 'reject') {                       // 317：插件决定拒绝
		turnEnds = { kind: 'blocked' }
		return false
	}
	if (turnEnds && decision.messages.length === 0) break   // 321：回合已结束且没新消息

	if (phase.step === 0 && decision.messages.length === 0) {  // 324：首个步骤就没消息
		turnEnds = { kind: 'completed' }
		return false
	}
	signal.throwIfAborted()
	this.session.append('step/start', { turn, step })       // 329：日志：步骤开始
	phase.step = step
	const toolRecovery = new ToolCallRecovery()             // 331：工具结果恢复器
	const stopRecovery = this.ctx.on('session/event', (session, event) => {
		if (session === this.session) toolRecovery.observe(event)
	})
	try {
		const stepEnd = await this.step(decision)           // 338：执行本步骤（请求模型+工具）
		if (turnEnds === null || turnEnds.kind !== 'max-tokens') turnEnds = stepEnd  // 341
	} catch (error: unknown) {
		for (const event of toolRecovery.results()) {       // 344–349：补记未落盘的工具结果
			this.session.append('tool/result', event.data, ...)
		}
		throw error
	} finally {
		stopRecovery()
		this.session.append('step/end', { turn, step })     // 356：日志：步骤结束
	}
	signal.throwIfAborted()
	if (turnEnds && this.inbox.nextStep.length === 0) {     // 359
		await this.dispatch.serial('agent/turn-stopping', { turn, signal })  // 360：回合即将停止的钩子
		signal.throwIfAborted()
	}
	if (turnEnds && this.inbox.nextStep.length === 0) break  // 363：回合结束
	target = 'next-step'                                     // 364：下一步从"步骤消息"取
}
```

逐段解读：

- **第 316 行**：`preStep`（7.5 节详读）做三件事：从收件箱取消息、组装系统提示词、
  走一次 `agent/pre-step` 瀑布让插件裁决。返回一个 `decision`。
- **第 317–320 行**：如果插件把决定改成 `reject`，回合以 `blocked` 结束。
  这是一个**外部策略**（比如"该任务需要用户审批，先别跑"）注入点。
- **第 321 行**：如果 `turnEnds` 已经非空（上个步骤已决定结束），且这次没有新消息，
  就退出循环。
- **第 324–327 行**：**首步骤就没有消息**的情况——比如唤醒消息已被移走。
  回合以 `completed` 结束，**但不花任何模型调用**。注释特别强调这一点：
  "它拥有初始回合边界，但不消耗模型调用"。这是对边界情况的精确处理。
- **第 329 行**：日志记录"步骤开始"。**每一步在日志里都有明确的 start/end 标记**，
  这是"可重建"的基础。
- **第 331–334 行**：`ToolCallRecovery`——订阅 `session/event`，**观察本回合内
  产生的工具结果事件**。一旦步骤中途抛错，catch 块会把"已产生但还没落盘的
  工具结果"补记进日志（344–349 行），再原样抛出。**这保证了：即使崩溃，
  工具造成的副作用也有完整记录**——这是"可审计"的关键一环。
- **第 338 行**：调用 `step()` 真正请求模型并执行工具（7.6 节）。
- **第 341 行**：这里有一个"**粘性**"（sticky）设计：`max-tokens` 一旦出现，
  后续正常完成的步骤**不能把回合结果降级**。意思是：如果某一步因输出超长而
  `max-tokens` 结束，即使下一步正常完成，整个回合的结果仍记为 `max-tokens`，
  让调用方知道"曾经被截断过"。
- **第 359–363 行**：回合要结束时，先发一个 `agent/turn-stopping` **串行钩子**
  （`dispatch.serial`），给插件最后一次干预的机会；之后如果收件箱没有新的
  "步骤级"消息，就 `break`。
- **第 364 行**：否则把 `target` 改成 `'next-step'`，**继续本回合的下一步**。
  这样，一次工具调用的结果会被当作"下一步的用户输入"继续驱动模型。

### 7.4.3 回合的收尾（366–396 行）

```ts
// 第 366–396 行（节选）
} catch (error: unknown) {
	const cause = abortedCancelCause(signal)                // 368：读取消原因
	if (cause !== undefined) {                              // 369
		turnEnds = { kind: 'aborted', reason: cause }        // 370
		throw error
	}
	turnEnds = {                                            // 375：结构化错误
		kind: 'error',
		error: error instanceof LlmError
			? error.failure
			: { message: errorChain(error), code: 'UNKNOWN' },   // 378–379
	}
	this.throwError(error)
} finally {
	this.session.append('turn/end', { turn, reason: turnEnds! })  // 385：日志：回合结束
}
if (!this.inbox.hasPending) return false                       // 390
phase.abort = new AbortController()                            // 391
phase.wakeRequested = false
phase.step = 0                                                 // 394
return true                                                    // 395：还有下一回合
```

- **第 368–371 行**：被取消时，用 `abortedCancelCause()` 读出"谁取消的"
  （user / parent / disposed / hook），记入 `turnEnds` 后重新抛出。
- **第 375–379 行**：**结构化的错误处理**——`LlmError` 保留其结构化的 `failure`，
  其他任何错误都被压平成 `{ message, code: 'UNKNOWN' }`。这保证了回合结束时，
  总能得到一个**可序列化、可记录**的错误结构。这是"记录友好"的错误哲学。
- **第 385 行**：`finally` 里无论如何都写 `turn/end`（带原因）。**即使异常，回合日志也是完整的。**
- **第 390–395 行**：`turn()` 返回 `true` 表示"收件箱还有消息，再开一个回合"，
  返回 `false` 表示"这次驱动结束"。返回 true 时重置 abort controller 和 step 计数。

> **小结 turn()**：dsh 的回合循环 = 步骤循环 + 会话日志 + 收件箱驱动。
> 它和 pi 的外层循环"思路一样"，但多了**持久化日志、显式状态、插件钩子、
> 结构化错误**这四层"保险"。

## 7.5 preStep()：打开一个步骤（第 267–286 行）

`preStep` 是每个步骤的"开工前准备"，也是 dsh 展示"瀑布拦截"的最佳示例：

```ts
// 第 267–286 行（节选）
const signal = this.phase.abort.signal
const claimed = this.inbox.claim(target, position.turn)   // 271：从收件箱领取消息
const assembly = await this.loopCtx.systemPrompt.assemble(assembleContextFor(this, signal))  // 272
signal.throwIfAborted()
const sections = renderContextSections(assembly)          // 274
const context = this.runtimeContext.project(joinContextSections(sections), sections)  // 275
const decision = await this.dispatch.waterfall(           // 276
	'agent/pre-step', { messages: claimed, ...position, signal },
	(): Promise<PreStepDecision> => Promise.resolve<PreStepDecision>({   // 278
		kind: 'enter',                                     // 279：默认决定：进入该步骤
		messages: context === undefined ? claimed : [...claimed, context],  // 280
	}),
)
signal.throwIfAborted()
return decision.kind === 'reject' ? decision : { ...decision, assembly }
```

- **第 271 行**：`inbox.claim`——从收件箱"领取"消息。注意是**领取**而不是"复制"：
  消息被标记为已被本回合处理，避免重复处理。
- **第 272 行**：组装系统提示词（`systemPrompt.assemble`）——把各种来源
  （基础指令、技能、环境信息）合成最终的系统提示。第 10 章详述。
- **第 275 行**：把上下文投影（project）到当前会话——可能插入"运行时上下文"
  （当前时间、仓库信息等）。
- **第 276–282 行**：**waterfall**：默认处理函数返回 `{ kind: 'enter', messages }`，
  即"进入步骤，消息 = 用户消息 + 上下文"。任何插件都可以监听 `agent/pre-step`
  事件，改写 `messages`（比如**注入额外的上下文**），或改成 `reject`。

> **waterfall 和普通事件的差别**：普通事件监听者只"听到"、不能改变结果；
> waterfall 监听者可以**替换返回值**。dsh 里所有"可被插件干预"的决策点
> 都用 waterfall。这是"插件化"的机制基础（第 12 章详述）。

## 7.6 一个步骤：step()（第 398–544 行）

`step()` 是"真正请求模型 + 执行工具"的地方，相当于 pi 的
`streamAssistantResponse` + `executeToolCalls` 的组合。新版把它拆成
两个职责：`prepareRequest()`（547 行，解析配置 + 绑定适配器）和
`buildRequest()`（599 行，构造并冻结请求）。核心流程：

```ts
// 第 398–544 行（节选，含注释精简）
private async step(decision: Extract<PreparedStep, { kind: 'enter' }>): Promise<StepEndReason | null> {
	const { turn, step, abort: { signal } } = this.phase
	signal.throwIfAborted()
	const { assembly } = decision
	const renderedPrompt = renderPrompt(assembly)           // 405：渲染系统提示为文本
	let firstAttempt = true
	while (true) {
		const { config, preparedCall } = await this.prepareRequest(turn, step, signal)  // 408
		// ... 写 system/message 日志、首次写 user/message 日志（417、421 行）...
		const request = this.buildRequest(config, preparedCall, assembly.tools,
			{ turn, step }, startsRequestSeries, signal)    // 425：构造并冻结请求
		const live = new AssistantStreamAttempt(...)        // 426：追踪本次"尝试"
		let started = false
		try {
			const stream = preparedCall?.stream(request) ?? this.loopCtx.llm.stream(request)  // 436
			signal.throwIfAborted()
			live.start()
			started = true
			for await (const chunk of stream) {             // 440：消费流式块
				signal.throwIfAborted()
				live.push(chunk)
			}
		} catch (error: unknown) {
			if (!started) throw error
			if (signal.aborted) {                            // 448：被取消→落"中断消息"
				live.settle('assistant/message', () => this.session.append('assistant/message', {
					turn, step, message: createAssistantMessage({ content, source }),
					interrupted: true, ... }))               // 451–465
			} else {                                         // 472：流中断→落"尝试"
				live.settle('assistant/attempt', () =>
					this.session.append('assistant/attempt', { turn, step, stream: live.stream }).seq)
			}
			throw error
		}
		const finish = live.finish                          // 488：结束原因
		if (finish.kind === 'error' || finish.kind === 'aborted') {  // 489
			const action = await this.dispatch.waterfall(
				'agent/request-error', { turn, step, provider: request.provider,
					failure: finish.failure, retryPolicy: preparedCall?.retryPolicy, signal },
				() => Promise.resolve<RequestErrorAction>(undefined),
			)
			signal.throwIfAborted()
			if (action?.kind !== 'retry') {                 // 506：不重试就抛错
				throw new LlmError(finish.failure.message, finish.failure.code, finish.failure)
			}
			continue                                        // 509：插件说重试，再来一轮
		}
		// ... 正常：组装 assistant 消息、写日志（512–529 行）
		if (finish.kind === 'max-tokens') return { kind: 'max-tokens' }  // 530
		const toolCalls = message.content.filter(block => block.type === 'tool-call')  // 532
		if (toolCalls.length === 0) return { kind: 'completed' }  // 533：没有工具调用 → 完成
		const { concluded } = await executeToolCalls(      // 534：执行工具
			this.loopCtx, turn, step, toolCalls, signal,
			context => this.inbox.splice('next-step', this.inbox.nextStep.length, 0, [context]),  // 536
		)
		return concluded ? { kind: 'completed' } : null     // 538：concluded 为真则回合结束，否则继续 while
	}
}
```

逐段解读：

- **第 405 行**：把 `assembly`（系统提示的结构化表示）渲染成一段文本 `system`，
  这是真正发给模型的系统提示。
- **第 425 行**：`buildRequest` 构造请求。**消息不是从内存数组拿，而是从
  会话日志派生**（内部调用 `session.deriveMessages()`）。
  这是 dsh 最核心的不可变原则：**请求的内容 = 会话日志的函数**。
- **第 436 行**：请求默认走 `ctx.llm.stream(request)`，
  但如果 `prepareCall` 生成了绑定好的 `preparedCall`，就用它的 `stream`。
- **第 440–442 行**：逐块消费流。注意：**流式块不再逐块写日志**，而是由
  `AssistantStreamAttempt`（`live`）统一追踪——它既对外发 `agent/assistant-stream`
  帧给 UI，也在"尝试失败/被中断"时负责把结果**结算**（settle）成一条日志事件：
  - 被**取消**：落一条 `assistant/message`（`interrupted: true`）——
    把已生成的半截回复也记进日志；
  - **流中断/出错**：落一条 `assistant/attempt`——记录"这次尝试发生过"。
  **为什么先记录再消费？** 因为"模型看到的一切都必须能从日志重建"——
  每次尝试都要有据可查。
- **第 489–509 行**：流结束（finish）时如果出错或被中断，先走 `agent/request-error`
  **瀑布**给插件机会：插件可以返回 `{ kind: 'retry' }` 让循环**重试**，否则抛
  `LlmError`。**重试策略是插件化的，不在循环里写死**——这是 dsh 和 codex 的一个
  关键差异（codex 的重试逻辑写死在采样循环里，见第 8 章）。
- **第 530 行**：`max-tokens`（超长截断）时，本步骤以 `max-tokens` 结束。
- **第 532–533 行**：没有工具调用 → 步骤 `completed`（任务完成）。
- **第 534–538 行**：有工具调用 → 执行（`executeToolCalls`，工具调度器）。
  工具结果通过回调 `context => this.inbox.splice('next-step', ...)` **放进收件箱的
  下一步位置**，让 `turn()` 的下一个步骤去领取。`concluded` 表示"这批工具结果
  是否直接终结回合"；否则返回 `null`，**外层 `while(true)` 继续**（模型会看到
  工具结果后再次被请求）。

> **小结 step()**：步骤 = 构造请求 → 流式消费（尝试结算进日志）→ 错误可重试 →
> 判结束 → 有工具调用则执行并放回收件箱。这就是 dsh 的"一次思考—行动"。

## 7.7 buildRequest()：请求的"冻结"与日志（第 599–687 行）

dsh 构造请求的方式很有特色。要点：

- 请求从会话的 `requestHeader()`（已记录的请求头）派生初始配置；
- 走 `agent/request` 瀑布让插件**改写请求配置**（provider/model/reasoningEffort 等）；
- 用 `prepareCall` 绑定"确切模型的适配器默认值"（比如该模型默认的 max tokens）；
- 请求/上下文变化时，追加 `request/header`、`request/context` 日志事件；
- 工具清单变化时，追加 `developer/message`（`tool-addition` / `tool-removal`）——
  **模型对工具的可见性变化本身也被记录**；
- **请求是深冻结的（`deepFreeze`）**：任何插件都不能在事后修改它（第 677–686 行）。

一个关键设计是**"重放时能重建请求"**：因为请求纯由会话日志派生 + 深冻结，
所以只要日志在，就能在另一个进程里精确重建"当时发给模型的是什么"。
这是 dsh "模型可见 ⟺ 可记录"铁律的直接体现（第 11 章）。

## 7.8 收件箱（Inbox）：pi 没有的一层

pi 直接用 `context.messages.push(...)` 追加消息，而 dsh 用 `Inbox`
（`packages/core/agent-loop/src/inbox.ts`）管理消息的"去向"。它支持三种投放位置：

| 目标 | 含义 |
|------|------|
| `next-turn` | 下一个回合处理（普通用户消息） |
| `next-step` | 当前回合的下一步处理（工具结果、转向消息） |
| `splice` 定位 | 更细粒度的插入位置（在指定下标前插入） |

收件箱解决了"消息到达时机"问题：用户可能在 Agent 思考的中途发新消息，
这条消息应**立即打断**还是**排队到下个回合**？dsh 通过 `send(message, target, wakeup)`
三参数 API 精确控制（第 7.3 节提过 `wakeDriver` 的"唤醒"机制），
并把"转向（steer）"和"跟注（followup）"作为两种不同的投放方式：
`steer` 投到 `next-step`（立刻影响当前回合），`followup` 投到 `next-turn`
（下一回合再处理）。这在 pi 里对应 `getSteeringMessages` / `getFollowUpMessages`
钩子——但 dsh 把它做成了核心机制，而非可选钩子。

## 7.9 dsh vs pi：一张表看懂"工程化"加了什么

| 维度 | pi | dsh |
|------|-----|-----|
| 循环入口 | `runLoop`（函数） | `ReactLoopAgent`（类 + 状态机） |
| 状态管理 | 局部变量 | `phase` 状态机 + 状态事件 |
| 会话 | 内存数组 `context.messages` | 持久化 `Session` 事件日志 |
| 消息投递 | `push` + 钩子 | `Inbox`（turn/step 目标 + 唤醒） |
| 插件扩展 | 少量可选钩子 | waterfall + serial 事件，几乎每处可拦 |
| 请求构造 | `streamAssistantResponse` 内联 | `prepareRequest` + `buildRequest` + 深冻结 + 日志 |
| 错误处理 | `stopReason` 简单分支 | 结构化 `TurnEndReason` + `LlmError` |
| 重试 | 无内建 | `agent/request-error` 瀑布（插件决定） |
| 可复现性 | 无保证 | **模型可见 ⟺ 会话日志可重建** |

**一句话**：pi 用 940 行把"循环"讲清楚了；dsh 用更重的结构，把"循环"变成了
一个**可持久化、可扩展、可追溯**的工程系统。两者没有优劣——pi 适合学习和快速
迭代，dsh 适合需要长期演进、多人协作的产品底座。

## 7.10 本章小结

- dsh 的推理循环 = 状态机（idle/maintenance/running）+ `turn()` 回合循环 +
  `step()` 步骤循环；
- 会话日志（Session）贯穿始终：turn/start、step/start、user/message、
  assistant/message、step/end、turn/end……所有事件都可重建；
- `preStep` 走 waterfall，让插件能改写消息或拒绝步骤；
- 错误处理是结构化的：`LlmError` 保结构，其他错误压平成
  `{ message, code: 'UNKNOWN' }`；
- 收件箱（Inbox）精确管理消息的回合/步骤投放与唤醒；
- 请求深冻结 + 纯由日志派生，保证了"模型可见 ⟺ 可记录"。

## 动手练习

1. **读会话日志**：在 dsh 里跑一个简单的 Agent 任务，然后找到会话日志文件，
   数一数一次"调了一个工具"的任务产生了哪些类型的事件，顺序如何。
2. **打断它**：在 Agent 运行中途发送一条"steer"消息（`steer()`），观察
   `Inbox` 如何把它投到 `next-step`，模型如何"转向"。
3. **改瀑布**：注册一个 `agent/pre-step` 的 waterfall 监听器，在所有步骤前
   注入一条"注意：请用中文回答"的上下文，观察效果。
4. **思考题**：`buildRequest` 为什么要把请求"深冻结"？如果不冻结，
   插件在请求发出后修改它，会破坏什么不变量？（提示：可复现性）

---

**下一章**：[第 8 章 代码精读（三）：codex 的生产级回合](./ch08-code-codex.md)
dsh 让我们看到"插件化 + 可记录"。现在进入 codex——看一个 Rust 写成的
生产级 Agent，如何给同一副骨架加上"重试、压缩、钩子、世界状态"四大保险。
