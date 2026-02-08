/**
 * editorjs-chatbot
 * Editor.js AI 聊天 Block Tool
 */
import './index.css';
import 'highlight.js/styles/github-dark.css';
import 'katex/dist/katex.min.css';

import { make } from '@editorjs/dom';
import type { API, BlockAPI, BlockTool, SanitizerConfig } from '@editorjs/editorjs';
import { renderMarkdown, bindCodeCopyButtons } from './chatRenderer';
import type {
  ChatMessage,
  ChatbotData,
  ChatbotConfig,
  ChatbotParams,
  ChatbotCSS,
  AiChatHandle,
} from './types';

// 聊天气泡图标 (SVG)
const CHAT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

// 用户头像图标
const USER_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

// AI 头像图标
const AI_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 3 3v1a3 3 0 0 1-3 3h-1v4H8v-4H7a3 3 0 0 1-3-3v-1a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4z"/><circle cx="9" cy="10" r="1"/><circle cx="15" cy="10" r="1"/><path d="M9 14h6"/></svg>';

// 发送图标
const SEND_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';

// 停止图标
const STOP_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>';

export default class Chatbot implements BlockTool {
  private api: API;
  private readOnly: boolean;
  private block: BlockAPI;
  private config: ChatbotConfig;
  private data: ChatbotData;
  private css: ChatbotCSS;

  // DOM 元素引用
  private wrapper: HTMLElement | null = null;
  private messageList: HTMLElement | null = null;
  private inputEl: HTMLTextAreaElement | null = null;
  private sendBtn: HTMLElement | null = null;
  private stopBtn: HTMLElement | null = null;

  // 流式状态
  private isStreaming: boolean = false;
  private currentHandle: AiChatHandle | null = null;
  private currentAssistantContent: string = '';
  private currentAssistantEl: HTMLElement | null = null;
  private isCollapsed: boolean = false;

  static get isReadOnlySupported(): boolean {
    return true;
  }

  static get toolbox() {
    return {
      title: 'AI 对话',
      icon: CHAT_ICON,
    };
  }

  static get sanitize(): SanitizerConfig {
    return {};
  }

  static get enableLineBreaks(): boolean {
    return true;
  }

  constructor({ data, config, api, readOnly, block }: ChatbotParams) {
    this.api = api;
    this.readOnly = readOnly;
    this.block = block;
    this.config = config || {};
    this.data = this.normalizeData(data);

    this.css = {
      wrapper: 'cdx-chatbot',
      header: 'cdx-chatbot__header',
      headerTitle: 'cdx-chatbot__header-title',
      headerToggle: 'cdx-chatbot__header-toggle',
      messageList: 'cdx-chatbot__messages',
      message: 'cdx-chatbot__msg',
      messageUser: 'cdx-chatbot__msg--user',
      messageAssistant: 'cdx-chatbot__msg--assistant',
      messageContent: 'cdx-chatbot__msg-content',
      messageAvatar: 'cdx-chatbot__msg-avatar',
      inputArea: 'cdx-chatbot__input-area',
      input: 'cdx-chatbot__input',
      sendBtn: 'cdx-chatbot__send-btn',
      stopBtn: 'cdx-chatbot__stop-btn',
      loading: 'cdx-chatbot__loading',
      loadingDots: 'cdx-chatbot__loading-dots',
      collapsed: 'cdx-chatbot--collapsed',
      codeBlock: 'cdx-chatbot__code-block',
      codeCopyBtn: 'cdx-chatbot__code-copy',
    };
  }

  /**
   * 规范化传入数据
   */
  private normalizeData(data: Partial<ChatbotData> | undefined): ChatbotData {
    const d = data || {};
    return {
      messages: Array.isArray(d.messages) ? d.messages.map((m) => ({
        role: m.role || 'user',
        content: m.content || '',
        timestamp: m.timestamp || undefined,
      })) : [],
      connectionId: d.connectionId || null,
      systemPrompt: d.systemPrompt || this.config?.systemPrompt || '',
    };
  }

  /**
   * 渲染 Block UI
   */
  render(): HTMLElement {
    this.wrapper = make('div', [this.css.wrapper]) as HTMLElement;

    // ---- 头部 ----
    const header = make('div', [this.css.header]) as HTMLElement;

    const titleEl = make('div', [this.css.headerTitle]) as HTMLElement;
    titleEl.innerHTML = AI_ICON + '<span>AI 对话</span>';

    const toggleBtn = make('button', [this.css.headerToggle]) as HTMLElement;
    toggleBtn.textContent = '折叠';
    toggleBtn.addEventListener('click', () => this.toggleCollapse());

    header.appendChild(titleEl);
    header.appendChild(toggleBtn);
    this.wrapper.appendChild(header);

    // ---- 消息列表 ----
    this.messageList = make('div', [this.css.messageList]) as HTMLElement;
    this.wrapper.appendChild(this.messageList);

    // 渲染已有消息
    for (const msg of this.data.messages) {
      if (msg.role === 'system') continue;
      this.appendMessageBubble(msg.role as 'user' | 'assistant', msg.content);
    }

    // ---- 输入区域（非只读时显示）----
    if (!this.readOnly) {
      const inputArea = make('div', [this.css.inputArea]) as HTMLElement;

      this.inputEl = document.createElement('textarea');
      this.inputEl.className = this.css.input;
      this.inputEl.placeholder = this.config.placeholder || '输入消息，按 Enter 发送...';
      this.inputEl.rows = 1;
      this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
      this.inputEl.addEventListener('input', () => this.autoResizeInput());

      this.sendBtn = make('button', [this.css.sendBtn]) as HTMLElement;
      this.sendBtn.innerHTML = SEND_ICON;
      this.sendBtn.title = '发送 (Enter)';
      this.sendBtn.addEventListener('click', () => this.sendMessage());

      this.stopBtn = make('button', [this.css.stopBtn]) as HTMLElement;
      this.stopBtn.innerHTML = STOP_ICON;
      this.stopBtn.title = '停止生成';
      this.stopBtn.style.display = 'none';
      this.stopBtn.addEventListener('click', () => this.stopStreaming());

      inputArea.appendChild(this.inputEl);
      inputArea.appendChild(this.sendBtn);
      inputArea.appendChild(this.stopBtn);
      this.wrapper.appendChild(inputArea);
    }

    // 滚动到底部
    this.scrollToBottom();

    return this.wrapper;
  }

  /**
   * 保存数据
   */
  save(): ChatbotData {
    return {
      messages: this.data.messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      })),
      connectionId: this.data.connectionId,
      systemPrompt: this.data.systemPrompt,
    };
  }

  /**
   * 验证数据有效性
   */
  validate(savedData: ChatbotData): boolean {
    return savedData && Array.isArray(savedData.messages);
  }

  // ========== 对话逻辑 ==========

  /**
   * 发送消息
   */
  private sendMessage(): void {
    if (this.isStreaming) return;
    if (!this.inputEl) return;

    const text = this.inputEl.value.trim();
    if (!text) return;

    // 清空输入框
    this.inputEl.value = '';
    this.autoResizeInput();

    // 添加用户消息
    const userMsg: ChatMessage = {
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    this.data.messages.push(userMsg);
    this.appendMessageBubble('user', text);

    // 调用 AI
    this.startStreaming();
  }

  /**
   * 开始流式请求
   */
  private startStreaming(): void {
    const aiChat = this.config.aiChat;
    if (typeof aiChat !== 'function') {
      this.appendMessageBubble('assistant', '错误：AI 聊天功能未配置。请检查系统设置。');
      return;
    }

    this.isStreaming = true;
    this.updateButtonState();

    // 准备 AI 消息气泡
    this.currentAssistantContent = '';
    this.currentAssistantEl = this.appendMessageBubble('assistant', '');
    this.showLoadingIndicator();

    // 构造消息数组（包含 system prompt）
    const messages: ChatMessage[] = [];
    if (this.data.systemPrompt) {
      messages.push({ role: 'system', content: this.data.systemPrompt });
    }
    for (const m of this.data.messages) {
      messages.push({ role: m.role, content: m.content });
    }

    // 发起流式请求
    const handle = aiChat(
      messages,
      (chunk: string) => {
        this.hideLoadingIndicator();
        this.currentAssistantContent += chunk;
        this.renderAssistantContent();
      },
      {
        connection_id: this.data.connectionId,
      }
    );

    this.currentHandle = handle;

    // 处理完成/错误
    handle.done
      .then(() => {
        this.hideLoadingIndicator();
        if (!this.currentAssistantContent) {
          this.currentAssistantContent = '(无回复内容)';
          this.renderAssistantContent();
        }
        // 保存到数据
        this.data.messages.push({
          role: 'assistant',
          content: this.currentAssistantContent,
          timestamp: Date.now(),
        });
      })
      .catch((err: Error) => {
        this.hideLoadingIndicator();
        const errText = this.currentAssistantContent
          ? this.currentAssistantContent + '\n\n[错误: ' + (err.message || '请求失败') + ']'
          : '错误: ' + (err.message || '请求失败');
        this.currentAssistantContent = errText;
        this.renderAssistantContent();
        this.data.messages.push({
          role: 'assistant',
          content: errText,
          timestamp: Date.now(),
        });
      })
      .finally(() => {
        this.isStreaming = false;
        this.currentHandle = null;
        this.currentAssistantEl = null;
        this.updateButtonState();
      });
  }

  /**
   * 停止生成
   */
  private stopStreaming(): void {
    if (this.currentHandle) {
      this.currentHandle.abort();
    }
  }

  // ========== UI 辅助方法 ==========

  /**
   * 追加消息气泡到列表
   */
  private appendMessageBubble(role: 'user' | 'assistant', content: string): HTMLElement {
    const msgEl = make('div', [
      this.css.message,
      role === 'user' ? this.css.messageUser : this.css.messageAssistant,
    ]) as HTMLElement;

    const avatarEl = make('div', [this.css.messageAvatar]) as HTMLElement;
    avatarEl.innerHTML = role === 'user' ? USER_ICON : AI_ICON;

    const contentEl = make('div', [this.css.messageContent]) as HTMLElement;
    if (role === 'assistant' && content) {
      contentEl.innerHTML = renderMarkdown(content);
      bindCodeCopyButtons(contentEl);
    } else {
      contentEl.textContent = content;
    }

    msgEl.appendChild(avatarEl);
    msgEl.appendChild(contentEl);

    if (this.messageList) {
      this.messageList.appendChild(msgEl);
      this.scrollToBottom();
    }

    return contentEl;
  }

  /**
   * 渲染当前流式 AI 内容
   */
  private renderAssistantContent(): void {
    if (!this.currentAssistantEl) return;
    this.currentAssistantEl.innerHTML = renderMarkdown(this.currentAssistantContent);
    bindCodeCopyButtons(this.currentAssistantEl);
    this.scrollToBottom();
  }

  /**
   * 显示加载指示器
   */
  private showLoadingIndicator(): void {
    if (!this.currentAssistantEl) return;
    // 如果已有内容就不再显示 loading 点
    if (this.currentAssistantContent) return;
    this.currentAssistantEl.innerHTML =
      '<div class="' + this.css.loadingDots + '">' +
      '<span></span><span></span><span></span>' +
      '</div>';
  }

  /**
   * 隐藏加载指示器
   */
  private hideLoadingIndicator(): void {
    if (!this.currentAssistantEl) return;
    const dots = this.currentAssistantEl.querySelector('.' + this.css.loadingDots);
    if (dots) dots.remove();
  }

  /**
   * 自动调整输入框高度
   */
  private autoResizeInput(): void {
    if (!this.inputEl) return;
    this.inputEl.style.height = 'auto';
    const maxH = 120;
    this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, maxH) + 'px';
  }

  /**
   * 滚动消息列表到底部
   */
  private scrollToBottom(): void {
    if (!this.messageList) return;
    requestAnimationFrame(() => {
      if (this.messageList) {
        this.messageList.scrollTop = this.messageList.scrollHeight;
      }
    });
  }

  /**
   * 更新按钮显示状态
   */
  private updateButtonState(): void {
    if (this.sendBtn) {
      this.sendBtn.style.display = this.isStreaming ? 'none' : '';
    }
    if (this.stopBtn) {
      this.stopBtn.style.display = this.isStreaming ? '' : 'none';
    }
    if (this.inputEl) {
      this.inputEl.disabled = this.isStreaming;
    }
  }

  /**
   * 折叠/展开消息列表
   */
  private toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed;
    if (this.wrapper) {
      if (this.isCollapsed) {
        this.wrapper.classList.add(this.css.collapsed);
      } else {
        this.wrapper.classList.remove(this.css.collapsed);
        this.scrollToBottom();
      }
    }
    // 更新按钮文字
    const btn = this.wrapper?.querySelector('.' + this.css.headerToggle);
    if (btn) {
      btn.textContent = this.isCollapsed ? '展开' : '折叠';
    }
  }
}
