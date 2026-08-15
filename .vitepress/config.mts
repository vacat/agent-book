import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

const sidebar = [
  {
    text: '开始',
    items: [{ text: '前言', link: '/00-前言' }],
  },
  {
    text: '第一部分 · 基础篇',
    collapsed: false,
    items: [
      { text: '第 1 章 你好，Agent', link: '/01-基础篇/01-你好-Agent' },
      { text: '第 2 章 Agent 的骨架：会话、上下文与消息', link: '/01-基础篇/02-会话与消息' },
      { text: '第 3 章 工具：Agent 的双手', link: '/01-基础篇/03-工具' },
      { text: '第 4 章 模型接入：从 API 到统一抽象', link: '/01-基础篇/04-模型接入' },
    ],
  },
  {
    text: '第二部分 · 核心篇',
    collapsed: false,
    items: [
      { text: '第 5 章 推理循环：思考—行动—观察', link: '/02-核心篇/05-推理循环' },
      { text: '第 6 章 代码精读（一）：pi 的推理循环', link: '/02-核心篇/06-代码精读-pi' },
      { text: '第 7 章 代码精读（二）：dsh 的回合与步骤', link: '/02-核心篇/07-代码精读-dsh' },
      { text: '第 8 章 代码精读（三）：codex 的生产级回合', link: '/02-核心篇/08-代码精读-codex' },
      { text: '第 9 章 三种循环的对比与设计权衡', link: '/02-核心篇/09-三库对比' },
    ],
  },
  {
    text: '第三部分 · 进阶篇',
    collapsed: false,
    items: [
      { text: '第 10 章 上下文管理：系统提示词与压缩', link: '/03-进阶篇/10-上下文管理' },
      { text: '第 11 章 会话与记忆：让 Agent 可复现', link: '/03-进阶篇/11-会话与记忆' },
      { text: '第 12 章 扩展 Agent：插件、技能与 MCP', link: '/03-进阶篇/12-能力扩展' },
      { text: '第 13 章 安全边界：沙箱与权限', link: '/03-进阶篇/13-安全与沙箱' },
    ],
  },
  {
    text: '第四部分 · 实践篇',
    collapsed: false,
    items: [
      { text: '第 14 章 动手：从零写一个最小 Agent', link: '/04-实践篇/14-最小Agent' },
      { text: '第 15 章 综合案例：让三个代码库协作', link: '/04-实践篇/15-综合案例' },
    ],
  },
  {
    text: '附录',
    collapsed: false,
    items: [
      { text: '附录 A 术语表', link: '/附录/A-术语表' },
      { text: '附录 B 三库速查对照表', link: '/附录/B-三库对照表' },
      { text: '附录 C 练习参考答案', link: '/附录/C-练习答案' },
      { text: '附录 D 延伸阅读与资源', link: '/附录/D-资源' },
    ],
  },
]

// 仓库名决定 Pages 部署路径前缀（https://vacat.github.io/agent-book/）
const config = defineConfig({
  lang: 'zh-CN',
  title: 'Agent 技术实战',
  description: '从零读懂三大 Agent 代码库（pi / dsh / codex）',
  base: '/agent-book/',
  outDir: 'dist',
  lastUpdated: true,
  cleanUrls: true,
  head: [['link', { rel: 'icon', href: '/agent-book/favicon.svg' }]],
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '基础篇', link: '/01-基础篇/01-你好-Agent' },
      { text: '核心篇', link: '/02-核心篇/05-推理循环' },
      { text: '进阶篇', link: '/03-进阶篇/10-上下文管理' },
      { text: '实践篇', link: '/04-实践篇/14-最小Agent' },
      { text: '附录', link: '/附录/A-术语表' },
    ],
    sidebar,
    outline: { label: '本页目录', level: [2, 3] },
    docFooter: { prev: '上一章', next: '下一章' },
    editLink: {
      pattern: 'https://github.com/vacat/agent-book/edit/main/:path',
      text: '在 GitHub 上编辑本章',
    },
    lastUpdated: { text: '最后更新', formatOptions: { dateStyle: 'full', timeStyle: 'short' } },
    search: { provider: 'local' },
    footer: {
      message: 'CC BY-NC-SA 4.0 · 结合 pi / dsh / codex 三库讲解',
      copyright: 'Copyright © 2026',
    },
  },
})

export default withMermaid(config, {
  mermaid: {
    // mermaid 渲染参数
    mermaidConfig: { theme: 'default', securityLevel: 'loose' },
  },
})
