/**
 * 最小 Agent 示例（配合《Agent 技术实战》第 14 章）
 *
 * 运行方式：
 *   cd 04-实践篇/示例
 *   DEEPSEEK_API_KEY=sk-xxx node minimal-agent.ts "统计当前目录所有 .md 文件的总行数"
 *
 * 依赖：Node.js 18+（原生 fetch）。无第三方依赖。
 * 模型：OpenAI 兼容的 Chat Completions API（DeepSeek 等）。
 */
type Role = 'system' | 'user' | 'assistant';

interface ToolCall {
  id: string;
  name: string;
  arguments: string; // JSON 字符串（模型输出是文本）
}

interface Message {
  role: Role;
  content: string;          // 文本内容
  toolCalls?: ToolCall[];   // assistant 消息才可能有
  toolCallId?: string;      // user 消息才可能有：对哪次工具调用的结果
}

interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  execute(args: Record<string, unknown>): Promise<string>;
}

// ---------- 会话（第 2 章） ----------
const messages: Message[] = [
  {
    role: 'system',
    content:
      '你是一个乐于助人的编程助手。你只能使用提供的工具，工具结果是权威事实。' +
      '如果需要更多信息，请调用工具；任务完成后再给出最终回答。',
  },
];

// ---------- 工具（第 3 章） ----------
const tools: Tool[] = [
  {
    name: 'list_files',
    description: '列出当前目录下的所有文件',
    parameters: { type: 'object', properties: {} },
    async execute() {
      const fs = await import('node:fs');
      return fs.readdirSync('.').join('\n');
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
      const fs = await import('node:fs');
      return fs.readFileSync(String(args.path), 'utf8');
    },
  },
];

// ---------- 模型调用（第 4 章：统一接口 + 适配器） ----------
async function callModel(
  apiKey: string,
  baseUrl: string,
  model: string,
): Promise<Message> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => {
        const base: Record<string, unknown> = { role: m.role, content: m.content };
        if (m.toolCalls) {
          base.tool_calls = m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.arguments },
          }));
        }
        if (m.toolCallId) {
          base.tool_call_id = m.toolCallId;
        }
        return base;
      }),
      tools: tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
    }),
  });

  if (!res.ok) {
    throw new Error(`API 请求失败: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    choices: Array<{
      message: {
        content?: string | null;
        tool_calls?: Array<{
          id: string;
          function: { name: string; arguments: string };
        }>;
      };
    }>;
  };
  const msg = data.choices[0].message;
  const assistant: Message = {
    role: 'assistant',
    content: msg.content ?? '',
    toolCalls: (msg.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    })),
  };
  return assistant;
}

// ---------- 推理循环（第 5 章：思考—行动—观察） ----------
async function runAgent(
  userInput: string,
  apiKey: string,
  baseUrl: string,
  model: string,
): Promise<void> {
  messages.push({ role: 'user', content: userInput });

  let iterations = 0;
  const MAX_ITERATIONS = 8; // 保险：防止死循环

  while (true) {
    if (++iterations > MAX_ITERATIONS) {
      console.log('[Agent] 达到最大迭代次数，停止。');
      return;
    }

    // ① 思考：把历史和工具清单发给模型
    const assistant = await callModel(apiKey, baseUrl, model);
    messages.push(assistant);

    // ② 判断：模型要不要调用工具？
    if (assistant.toolCalls && assistant.toolCalls.length > 0) {
      // ③ 行动：逐个执行工具
      for (const call of assistant.toolCalls) {
        console.log(`[Agent] 调用工具 ${call.name}(${call.arguments})`);
        const tool = tools.find((t) => t.name === call.name);
        let result: string;
        if (!tool) {
          result = `错误：未知工具 ${call.name}`;
        } else {
          try {
            // 解析参数（第 3 章：arguments 是 JSON 字符串）
            const args = JSON.parse(call.arguments);
            result = await tool.execute(args);
          } catch (err: any) {
            result = `错误：${err?.message ?? String(err)}`;
          }
        }
        // ④ 观察：把结果放回历史（role: user + toolCallId）
        messages.push({ role: 'user', content: result, toolCallId: call.id });
      }
      continue; // 模型会看到工具结果，回到 while 顶部再次思考
    }

    // ⑤ 没有工具调用 → 任务完成
    console.log(`[Agent] ${assistant.content}`);
    return;
  }
}

async function main(): Promise<void> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error('请设置 DEEPSEEK_API_KEY');
    process.exit(1);
  }
  const input =
    process.argv.slice(2).join(' ') ||
    '列出当前目录文件，并统计其中所有 .md 文件的总行数。';
  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1';
  const model = process.env.MODEL ?? 'deepseek-chat';
  await runAgent(input, apiKey, baseUrl, model);
}

main().catch((err) => {
  console.error('运行出错：', err);
  process.exit(1);
});
