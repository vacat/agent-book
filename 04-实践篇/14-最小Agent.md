# 第 14 章 动手：从零写一个最小 Agent

> **本章目标**
> 1. 用 TypeScript 从零写一个**可运行**的最小 Agent；
> 2. 亲手实现第 5 章的"骨架循环"：思考—行动—观察；
> 3. 通过"真跑起来"验证你对推理循环的理解；
> 4. 为一个真实模型 API（兼容 OpenAI Chat Completions 的，如 DeepSeek）写工具调用。

> **本章是全书"动手"核心**。请一定打开编辑器，把代码敲出来、跑起来、改一改。
> 代码全文在 [示例/minimal-agent.ts](示例/minimal-agent.ts)，跟着本章一步步写。

## 14.1 我们要做什么

我们要写一个最小的、但**真实可用**的 Agent。它具备第 1 章讲的三大要素：

1. **会话记忆**：一个 `messages` 数组（第 2 章）；
2. **工具**：两个真实工具（读文件、执行简单的只读命令）（第 3 章）；
3. **推理循环**：一个 `while` 循环，思考—行动—观察（第 5 章）。

它能干这种活：

```
> 请帮我统计当前目录下所有 .md 文件的行数。
Agent: 我先看看目录里有哪些 md 文件。
  → 调用工具 list_files()
  → 结果: [...]
Agent: 现在统计行数。
  → 调用工具 read_file()
  → 结果: ...
Agent: 总共有 N 行。
```

我们用 **OpenAI 兼容的 Chat Completions API**（DeepSeek 也兼容这个格式），
所以只要你有一个 API key，就能真跑。我们的代码会尽量短，但**每个函数
都对应前面章节的一个概念**，读的时候请对照。

## 14.2 第一步：消息与会话（第 2 章）

先定义消息类型。我们的 Agent 只需要三类消息：

```ts
type Role = 'system' | 'user' | 'assistant';

interface Message {
  role: Role;
  content: string;          // 文本内容
  toolCalls?: ToolCall[];   // assistant 消息才可能有：本次要调用的工具
  toolCallId?: string;      // user 消息才可能有：这条是对哪次工具调用的结果
}

interface ToolCall {
  id: string;
  name: string;
  arguments: string;        // JSON 字符串（第 3 章强调过）
}
```

**对照第 2 章**：工具结果我们用 `role: 'user'` + `toolCallId` 标记，
和 dsh / pi 的做法一致。

会话就是：

```ts
const messages: Message[] = [
  { role: 'system', content: '你是一个乐于助人的编程助手。你只能使用提供的工具，工具结果是权威事实。' },
];
```

## 14.3 第二步：工具（第 3 章）

定义一个工具 = schema（说明书）+ execute（执行函数）。我们写两个工具：

```ts
interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;   // JSON Schema
  execute(args: Record<string, unknown>): Promise<string>;
}

const tools: Tool[] = [
  {
    name: 'list_files',
    description: '列出当前目录下的所有文件',
    parameters: { type: 'object', properties: {} },
    async execute() {
      return (await import('node:fs')).readdirSync('.').join('\n');
    },
  },
  {
    name: 'read_file',
    description: '读取一个文本文件的完整内容',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: '文件路径' } },
      required: ['path'],
    },
    async execute(args) {
      return (await import('node:fs')).readFileSync(String(args.path), 'utf8');
    },
  },
];
```

**对照第 3 章**：`parameters` 是 JSON Schema；`arguments` 从模型来时是字符串，
执行前要 `JSON.parse`。

## 14.4 第三步：调用模型（第 4 章）

写一个 `callModel` 函数，把消息 + 工具清单发给 API，拿到响应：

```ts
async function callModel(messages: Message[], apiKey: string, baseUrl: string, model: string) {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: messages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : m.role,
        content: m.content,
        // OpenAI 风格：把工具调用塞进 tool_calls 字段
        ...(m.toolCalls && { tool_calls: m.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments },
        })) }),
        // OpenAI 风格：工具结果塞进 tool_call_id + role: tool
        ...(m.toolCallId && { tool_call_id: m.toolCallId }),
      })),
      // 工具清单
      tools: tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
    }),
  });
  const data = await res.json();
  // 提取 assistant 回复
  const msg = data.choices[0].message;
  const assistant: Message = {
    role: 'assistant',
    content: msg.content ?? '',
    toolCalls: (msg.tool_calls ?? []).map((tc: any) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    })),
  };
  return assistant;
}
```

注意两个"适配器翻译"：
- **请求方向**：我们的 `Message` → OpenAI 的 `messages`（`tool_calls` 字段）；
- **响应方向**：OpenAI 的 `tool_calls` → 我们的 `toolCalls` 数组。

**对照第 4 章**：这就是"统一接口 + 适配器"的最小版本——我们的循环只认识自己的
`Message`，翻译工作全在这个函数里。

## 14.5 第四步：推理循环（第 5 章）——全书的"主角"

现在写最核心的循环。它是第 5 章骨架的忠实实现：

```ts
async function runAgent(userInput: string, apiKey: string, baseUrl: string, model: string) {
  messages.push({ role: 'user', content: userInput });

  let iterations = 0;
  const MAX_ITERATIONS = 8;                 // 保险：防止死循环

  while (true) {                            // ← 推理循环
    if (++iterations > MAX_ITERATIONS) {
      console.log('[Agent] 达到最大迭代次数，停止。');
      return;
    }

    // ① 思考：把历史和工具清单发给模型
    const assistant = await callModel(messages, apiKey, baseUrl, model);
    messages.push(assistant);

    // ② 判断：模型要不要调用工具？
    if (assistant.toolCalls && assistant.toolCalls.length > 0) {
      // ③ 行动：逐个执行工具
      for (const call of assistant.toolCalls) {
        console.log(`[Agent] 调用工具 ${call.name}(${call.arguments})`);
        const tool = tools.find(t => t.name === call.name);
        let result: string;
        if (!tool) {
          result = `错误：未知工具 ${call.name}`;
        } else {
          try {
            // 解析参数（第 3 章：arguments 是 JSON 字符串）
            const args = JSON.parse(call.arguments);
            result = await tool.execute(args);
          } catch (err: any) {
            result = `错误：${err.message}`;
          }
        }
        // ④ 观察：把结果放回历史（role: user + toolCallId）
        messages.push({ role: 'user', content: result, toolCallId: call.id });
      }
      // 回到 while 顶部，模型会看到工具结果 → 再次思考
      continue;
    }

    // ⑤ 没有工具调用 → 任务完成
    console.log(`[Agent] ${assistant.content}`);
    return;
  }
}
```

逐行对照第 5 章骨架：

| 骨架环节 | 这一行的代码 |
|---------|------------|
| 发请求（历史+工具） | `callModel(messages, ...)` |
| 找工具调用 | `assistant.toolCalls && assistant.toolCalls.length > 0` |
| 执行工具 | `tool.execute(args)` |
| 结果放回历史 | `messages.push({ role: 'user', content: result, toolCallId: call.id })` |
| 有 → 继续循环 | `continue` |
| 没有 → 返回 | `console.log(assistant.content); return` |

**是不是和 pi 的 `runLoop`、dsh 的 `step()`、codex 的 `run_sampling_request`
一模一样？** 你现在亲手写出的，就是它们的"最小公共核心"。第 6、7、8 章读到的
所有"保险"（事件流、会话日志、重试、沙箱……），都是在这个骨架上长出来的。

## 14.6 第五步：跑起来

加一个入口：

```ts
async function main() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) { console.error('请设置 DEEPSEEK_API_KEY'); process.exit(1); }
  const input = process.argv.slice(2).join(' ') || '列出当前目录文件，并统计其中所有 .md 文件的总行数。';
  await runAgent(input, apiKey, process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1', 'deepseek-chat');
}
main();
```

运行：

```sh
cd 示例
DEEPSEEK_API_KEY=sk-xxx node minimal-agent.ts "统计当前目录所有 .md 文件的总行数"
```

你会看到（示意）：

```text
[Agent] 调用工具 list_files({"x":...})
[Agent] 调用工具 read_file({"path":"README.md"})
[Agent] 调用工具 read_file({"path":"01-前言.md"})
[Agent] 统计结果：共有 4 个 .md 文件，合计 256 行。
```

**恭喜——你已经写出并跑通了一个真实的 Agent。** 从这一刻起，pi / dsh / codex
的代码对你不再是"别人的黑盒"，而是"自己写过的东西的强化版"。

## 14.7 加"保险"：三道练习题式的升级

我们的最小 Agent 跑通了骨架，但很脆弱。现在练习加保险（对照第 6、7、8 章）：

### 升级 1：处理截断（对照第 6 章 pi 的 `length` 处理）

如果模型输出因 token 超限被截断，`finish_reason` 会是 `"length"`。
在 `callModel` 里读取 `data.choices[0].finish_reason`，如果等于 `"length"`
且有 toolCalls，**拒绝执行**并让模型重试（想想为什么——第 6 章讲过）。

### 升级 2：工具结果截断（对照第 10 章 token 预算）

`read_file` 可能返回超大内容。在 `execute` 里给结果加一个长度上限
（比如 5000 字符），超了就截断并附注"内容过长，已截断"。想想截断会对
模型的理解造成什么影响。

### 升级 3：错误重试（对照第 8 章 codex 的重试）

在 `callModel` 里包一层 `try/catch`，对网络错误做**最多 3 次、指数退避**的重试。

```ts
async function callModelWithRetry(...) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await callModel(...); }
    catch (err) { if (attempt === 3) throw err; await sleep(2 ** attempt * 500); }
  }
}
```

### 升级 4：把内存会话换成日志（对照第 7、11 章 dsh 的会话）

给每个 `messages.push` 打印一行日志（或追加到文件），记录"时间、角色、内容摘要"。
跑完后，你就能回答"模型当时到底看到了什么"——这就是 dsh 会话日志的最小雏形。

## 14.8 扩展练习（可选的进阶作业）

1. **加一个 `bash` 工具**（受控）：允许模型执行"只读命令"（不允许 `rm`、`>` 等），
   参考第 13 章"审批 + 沙箱"的思路做一个最简单的命令白名单。
2. **加 MCP**：把 `list_files` / `read_file` 包装成一个极简的 MCP 服务器
   （或直接调用你熟悉的 MCP 客户端库），体会第 12 章"统一协议"的价值。
3. **写成 pi 的样子**：把这个循环重构成 pi 的"双层循环 + 事件流"结构
   （`agent_start`/`turn_start`/`message_update`……），感受"事件驱动 UI"。

## 14.9 本章小结

- 你亲手实现并跑通了 Agent 三大要素：会话、工具、推理循环；
- 循环骨架只有 5 步：发请求 → 找工具调用 → 有则执行放回历史 / 无则返回；
- 模型调用是"统一接口 + 适配器"；工具参数是 JSON 字符串需解析；
- 最小实现能跑通，但"保险"（截断、重试、日志、沙箱）全都要靠工程化补上；
- 你现在读 pi / dsh / codex 的代码，应该觉得亲切了。

---

**下一章**：[第 15 章 综合案例：让三个代码库协作](15-综合案例.md)
最后一章，我们做一个"三库协作"的综合案例，把全书知识串成一条完整的链。
