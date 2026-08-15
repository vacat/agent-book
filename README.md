# 《Agent 技术实战：从零读懂三大 Agent 代码库》

> **面向普通技术人员，用最通俗的语言，通过三个真实可运行的 Agent 代码库，由浅入深掌握 Agent 技术。**

📖 **在线阅读**：<https://vacat.github.io/agent-book/>

## 关于本书

这是一本面向普通技术人员的 Agent 技术教程，以 **pi / dsh（DeepSeek Harness）/ codex（OpenAI Codex）** 三个开源 Agent 代码库为蓝本，用通俗易懂的语言讲解 Agent 技术的完整工程栈。

### 特点

- **结合三个真实代码库讲解**：每个概念都对应三库的实现，可对照阅读源码
- **由浅入深**：从"Agent 是什么"到"安全沙箱"，4 个部分 15 章逐步推进
- **逐行解读关键推理代码**：第 6-8 章对 pi / dsh / codex 的推理循环逐行拆解
- **动手实验**：第 14 章从零实现一个可运行的最小 Agent，配套完整示例代码
- **全中文**：语言简单通俗，生活化类比贯穿全书

### 读者要求

- 会读 TypeScript 或 Rust 其中一种即可
- 不需要机器学习 / 深度学习背景
- 把模型当"黑盒 API"，不涉及模型内部原理

### 全书结构

| 部分 | 章节 | 主题 |
|------|------|------|
| 第一部分 基础篇 | 第 1-4 章 | Agent 概念、会话与消息、工具、模型接入 |
| 第二部分 核心篇 | 第 5-9 章 | 推理循环概念 + 三章代码精读（pi / dsh / codex） |
| 第三部分 进阶篇 | 第 10-13 章 | 上下文管理、会话与记忆、能力扩展、安全沙箱 |
| 第四部分 实践篇 | 第 14-15 章 | 从零写最小 Agent、三库协作综合案例 |
| 附录 | A-D | 术语表、三库对照表、练习答案、延伸资源 |

### 统计

- 15 章正文 + 4 个附录
- 17+ 张 mermaid 流程图
- 三库代码精读 1200+ 行逐行讲解
- 每章动手练习 + 附录参考答案

## 如何阅读

1. 网页版：直接访问 <https://vacat.github.io/agent-book/>
2. 本地阅读：从 `src/SUMMARY.md` 查看完整目录
3. 建议从第 1 章按顺序阅读；第 6-8 章是全书"代码精读"核心

## 本地构建（mdBook）

本书使用 [mdBook](https://rust-lang.github.io/mdBook/) 构建，与 llm-inference-book 同一方案。

```bash
# 安装 mdbook 与 mermaid 插件（macOS）
brew install mdbook
cargo install mdbook-mermaid
mdbook-mermaid install

# 构建 / 本地预览
mdbook build          # 输出到 book/
mdbook serve --open   # http://localhost:3000
```

## 目录结构

```
├── book.toml              # mdBook 配置
├── src/                   # 书籍源码（Markdown）
│   ├── SUMMARY.md         # 目录
│   ├── preface.md         # 前言
│   ├── ch01-*.md ~ ch15-*.md
│   ├── appendix-*.md
│   └── example/           # 第 14 章最小 Agent 示例
├── theme/custom.css       # 中文排版样式
└── .github/workflows/deploy.yml  # 自动构建并部署到 GitHub Pages
```

## 配套源码与版本

- **pi**：<https://github.com/earendil-works/pi>
- **dsh（DeepSeek Harness）**：<https://github.com/deepseek-ai/deepseek-harness>
- **codex（OpenAI Codex CLI）**：<https://github.com/openai/codex>

> 本书代码片段（尤其第 6-8 章代码精读）引用的文件路径与行号，对应以下 commit：

| 代码库 | commit | 提交日期 |
|--------|--------|---------|
| pi | `086c32e74` | 2026-08-15 |
| dsh（DeepSeek Harness） | `47f943859b` | 2026-08-13 |
| codex（OpenAI Codex） | `85fc4def35` | 2026-08-15 |

代码持续演进，行号可能漂移，请以上表为基准核对；本地核对：`git -C <路径> rev-parse HEAD`。

## 许可

本书原创文字以 CC BY-NC-SA 4.0 提供。引用的第三方代码版权归各项目所有。
