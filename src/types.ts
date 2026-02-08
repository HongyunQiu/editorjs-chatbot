import type { API, BlockAPI, BlockTool, ToolConfig } from '@editorjs/editorjs';

/**
 * 单条聊天消息
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

/**
 * Chatbot Block 工具保存的 JSON 数据
 */
export interface ChatbotData {
  messages: ChatMessage[];
  connectionId?: number | null;
  systemPrompt?: string;
}

/**
 * 流式聊天返回的控制对象
 */
export interface AiChatHandle {
  abort: () => void;
  done: Promise<void>;
}

/**
 * aiChat 回调函数类型
 */
export type AiChatFn = (
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  options?: {
    connection_id?: number | null;
    max_tokens?: number;
    temperature?: number;
  }
) => AiChatHandle;

/**
 * 工具配置（通过 Editor.js config 传入）
 */
export interface ChatbotConfig extends ToolConfig {
  aiChat?: AiChatFn;
  placeholder?: string;
  systemPrompt?: string;
}

/**
 * 构造函数参数
 */
export interface ChatbotParams {
  data: ChatbotData;
  config: ChatbotConfig;
  api: API;
  readOnly: boolean;
  block: BlockAPI;
}

/**
 * CSS 类名集合
 */
export interface ChatbotCSS {
  wrapper: string;
  header: string;
  headerTitle: string;
  headerToggle: string;
  messageList: string;
  message: string;
  messageUser: string;
  messageAssistant: string;
  messageContent: string;
  messageAvatar: string;
  inputArea: string;
  input: string;
  sendBtn: string;
  stopBtn: string;
  loading: string;
  loadingDots: string;
  collapsed: string;
  codeBlock: string;
  codeCopyBtn: string;
}
