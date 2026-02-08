# EditorJS Chatbot

AI 聊天对话 Block Tool —— 为 [Editor.js](https://editorjs.io/) 提供内嵌式 AI 对话能力。

## 功能特性

- **流式对话** — 支持 SSE 流式输出，实时逐字显示 AI 回复
- **Markdown 渲染** — 基于 [marked](https://github.com/markedjs/marked) 的完整 GFM Markdown 支持
- **代码高亮** — 集成 [highlight.js](https://highlightjs.org/)，内置 20+ 常用语言的语法高亮，支持一键复制代码
- **数学公式** — 集成 [KaTeX](https://katex.org/)，支持 `$...$` 行内公式和 `$$...$$` 块级公式
- **对话折叠** — 可折叠/展开消息列表，节省编辑器空间
- **只读支持** — 完整支持 Editor.js 只读模式，已有对话内容正常渲染
- **数据持久化** — 对话历史以 JSON 格式存储于 Editor.js Block 数据中

## 安装

### 构建与部署

本插件以 UMD 格式构建，通过将产物文件拷贝到宿主项目中使用。

1. 构建插件：

```bash
npm install
npm run build
```

2. 构建完成后，将 `dist/chatbot.umd.js` 拷贝到宿主项目的静态资源目录中。项目提供了一键构建并拷贝的脚本：

```bash
build_dist_copy.bat
```

该脚本会自动构建并将 `chatbot.umd.js` 拷贝到 `QNotes/public/vendor/editorjs-chatbot/` 目录下。

3. 在宿主页面中通过 `<script>` 标签引入：

```html
<script src="/vendor/editorjs-chatbot/chatbot.umd.js"></script>
```

引入后，`Chatbot` 类将挂载到全局 `window.Chatbot` 上。

## 快速开始

```javascript
const editor = new EditorJS({
  holder: 'editorjs',
  tools: {
    chatbot: {
      class: Chatbot,  // 通过 UMD 全局变量引用，或 import 引用
      config: {
        aiChat: (messages, onChunk, options) => {
          // 实现你的 AI 聊天逻辑，返回 { abort, done }
          const controller = new AbortController();

          const done = fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages, ...options }),
            signal: controller.signal,
          }).then(async (res) => {
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              onChunk(decoder.decode(value));
            }
          });

          return {
            abort: () => controller.abort(),
            done,
          };
        },
        placeholder: '输入消息，按 Enter 发送...',
        systemPrompt: '你是一个有帮助的AI助手。',
      },
    },
  },
});
```

## 配置项

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `aiChat` | `AiChatFn` | 是 | AI 聊天回调函数，接收消息列表和流式 chunk 回调，返回 `{ abort, done }` 控制对象 |
| `placeholder` | `string` | 否 | 输入框占位文字，默认 `"输入消息，按 Enter 发送..."` |
| `systemPrompt` | `string` | 否 | 系统提示词，作为对话上下文的首条 system 消息 |

### `aiChat` 函数签名

```typescript
type AiChatFn = (
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  options?: {
    connection_id?: number | null;
    max_tokens?: number;
    temperature?: number;
  }
) => AiChatHandle;

interface AiChatHandle {
  abort: () => void;
  done: Promise<void>;
}
```

## 数据格式

Block 保存的 JSON 数据结构如下：

```json
{
  "type": "chatbot",
  "data": {
    "messages": [
      { "role": "user", "content": "你好", "timestamp": 1700000000000 },
      { "role": "assistant", "content": "你好！有什么可以帮助你的？", "timestamp": 1700000001000 }
    ],
    "connectionId": null,
    "systemPrompt": ""
  }
}
```

### `ChatMessage` 字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `role` | `"user" \| "assistant" \| "system"` | 消息角色 |
| `content` | `string` | 消息内容（支持 Markdown） |
| `timestamp` | `number` (可选) | 消息时间戳（毫秒） |

## 支持的代码语言

代码高亮内置支持以下语言：

JavaScript / TypeScript / Python / Java / C / C++ / C# / Go / Rust / SQL / Bash / JSON / XML / HTML / CSS / Markdown / YAML / PHP / Ruby / Swift / Kotlin / Lua

## 开发

### 环境要求

- Node.js >= 16
- npm >= 8

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

### 项目结构

```
editorjs-chatbot/
├── src/
│   ├── index.ts          # 主入口，Chatbot BlockTool 实现
│   ├── index.css         # 样式文件
│   ├── chatRenderer.ts   # Markdown / 代码高亮 / LaTeX 渲染器
│   └── types.ts          # TypeScript 类型定义
├── dist/                 # 构建输出
├── vite.config.js        # Vite 构建配置
├── tsconfig.json         # TypeScript 配置
└── package.json
```

### 构建产物

| 文件 | 格式 | 用途 |
| --- | --- | --- |
| `dist/chatbot.mjs` | ES Module | 现代打包工具 (import) |
| `dist/chatbot.umd.js` | UMD | 浏览器 / CommonJS (require) |
| `dist/index.d.ts` | TypeScript 声明 | 类型支持 |

## 许可证

[MIT](https://opensource.org/licenses/MIT)
