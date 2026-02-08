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
  AiConnectionInfo,
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

  // 全屏状态
  private isFullscreen: boolean = false;
  private fullscreenOverlayEl: HTMLElement | null = null;
  private fullscreenToggleBtnEl: HTMLElement | null = null;
  private wrapperParentEl: HTMLElement | null = null;

  // 头部控件（模型/温度/长度）
  private connSelectEl: HTMLSelectElement | null = null;
  private temperatureInputEl: HTMLInputElement | null = null;
  private maxTokensKInputEl: HTMLInputElement | null = null;

  private connections: AiConnectionInfo[] = [];
  private isConnectionsLoading: boolean = false;
  private defaultTemperatureHint: number | null = null;
  private defaultMaxTokensHint: number | null = null;

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
      headerControls: 'cdx-chatbot__header-controls',
      headerLabel: 'cdx-chatbot__header-label',
      headerControl: 'cdx-chatbot__header-control',
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
      headerButtons: 'cdx-chatbot__header-buttons',
      fullscreenBtn: 'cdx-chatbot__header-fullscreen',
      fullscreenOverlay: 'cdx-chatbot__fullscreen-overlay',
      fullscreen: 'cdx-chatbot--fullscreen',
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
      temperature: (typeof d.temperature === 'number' ? d.temperature : null),
      maxTokens: (typeof d.maxTokens === 'number' ? d.maxTokens : null),
      systemPrompt: d.systemPrompt || this.config?.systemPrompt || '',
    };
  }

  private toFiniteNumber(v: any): number | null {
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private safeParseJson(raw: any): any | null {
    if (raw == null) return null;
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(String(raw));
    } catch {
      return null;
    }
  }

  private getConnectionParams(conn: AiConnectionInfo | null): any {
    if (!conn) return {};
    const cfg = this.safeParseJson((conn as any).config) || {};
    const raw = cfg && typeof cfg.params === 'object' && cfg.params ? cfg.params : cfg;
    if (!raw || typeof raw !== 'object') return {};
    const out: any = { ...raw };
    if (out.proxy) delete out.proxy;
    return out;
  }

  private findDefaultConnection(): AiConnectionInfo | null {
    const list = Array.isArray(this.connections) ? this.connections : [];
    const def = list.find((c) => c && (c.is_default === 1 || c.is_default === true));
    return def || null;
  }

  private getSelectedOrDefaultConnection(): AiConnectionInfo | null {
    const list = Array.isArray(this.connections) ? this.connections : [];
    if (this.data.connectionId != null) {
      const found = list.find((c) => String(c && c.id) === String(this.data.connectionId));
      if (found) return found;
    }
    return this.findDefaultConnection();
  }

  private updateHeaderDefaultHints(): void {
    const conn = this.getSelectedOrDefaultConnection();
    const params = this.getConnectionParams(conn);
    const t = this.toFiniteNumber(params.temperature);
    const mt =
      this.toFiniteNumber(params.max_tokens) ??
      this.toFiniteNumber(params.max_completion_tokens);

    this.defaultTemperatureHint = t;
    this.defaultMaxTokensHint = mt;

    if (this.temperatureInputEl && (this.data.temperature == null || this.temperatureInputEl.value.trim() === '')) {
      this.temperatureInputEl.placeholder = t != null ? String(t) : 'T';
    }
    if (this.maxTokensKInputEl && (this.data.maxTokens == null || this.maxTokensKInputEl.value.trim() === '')) {
      if (mt != null && mt > 0) {
        const k = Math.round((mt / 1000) * 100) / 100;
        this.maxTokensKInputEl.placeholder = String(k);
      } else {
        this.maxTokensKInputEl.placeholder = 'K';
      }
    }

    // 更新“默认”选项文案为默认连接名称（若可用）
    const select = this.connSelectEl;
    if (select && select.options && select.options.length) {
      const opt0 = select.options[0];
      if (opt0 && opt0.value === '') {
        const def = this.findDefaultConnection();
        const defName = def && def.name ? String(def.name) : '';
        opt0.textContent = defName ? ('默认（' + defName + '）') : '默认';
      }
    }
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

    // 头部控件（紧凑显示）
    const controls = make('div', [this.css.headerControls]) as HTMLElement;
    this.renderHeaderControls(controls);

    const toggleBtn = make('button', [this.css.headerToggle]) as HTMLElement;
    toggleBtn.textContent = '折叠';
    toggleBtn.addEventListener('click', () => this.toggleCollapse());

    const fullscreenBtn = make('button', [this.css.fullscreenBtn]) as HTMLElement;
    fullscreenBtn.textContent = '全屏';
    fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
    this.fullscreenToggleBtnEl = fullscreenBtn;

    const headerButtons = make('div', [this.css.headerButtons]) as HTMLElement;
    headerButtons.appendChild(controls);
    headerButtons.appendChild(toggleBtn);
    headerButtons.appendChild(fullscreenBtn);

    header.appendChild(titleEl);
    header.appendChild(headerButtons);
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

    // 触发一次连接列表加载（若宿主提供）
    this.ensureConnectionsLoaded();
    // 在连接列表加载前也先给出当前占位（可能是空/本地默认）
    this.updateHeaderDefaultHints();

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
      temperature: this.data.temperature,
      maxTokens: this.data.maxTokens,
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
    const aiOptions: any = {};
    if (this.data.connectionId != null) aiOptions.connection_id = this.data.connectionId;
    if (typeof this.data.temperature === 'number') aiOptions.temperature = this.data.temperature;
    if (typeof this.data.maxTokens === 'number') aiOptions.max_tokens = this.data.maxTokens;

    const handle = aiChat(
      messages,
      (chunk: string) => {
        this.hideLoadingIndicator();
        this.currentAssistantContent += chunk;
        this.renderAssistantContent();
      },
      aiOptions
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
    const disableControls = this.readOnly || this.isStreaming;
    if (this.connSelectEl) this.connSelectEl.disabled = disableControls || this.isConnectionsLoading;
    if (this.temperatureInputEl) this.temperatureInputEl.disabled = disableControls;
    if (this.maxTokensKInputEl) this.maxTokensKInputEl.disabled = disableControls;
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

  private async ensureConnectionsLoaded(): Promise<void> {
    const listFn = this.config && this.config.listConnections;
    if (typeof listFn !== 'function') return;
    if (this.isConnectionsLoading) return;
    if (this.connections && this.connections.length) return;

    this.isConnectionsLoading = true;
    this.refreshConnectionSelectOptions();
    this.updateButtonState();
    try {
      const res = await listFn();
      const list = Array.isArray(res) ? res : (res && Array.isArray((res as any).connections) ? (res as any).connections : []);
      this.connections = (Array.isArray(list) ? list : []).filter((c) => c && typeof c.id === 'number');
    } catch {
      this.connections = [];
    } finally {
      this.isConnectionsLoading = false;
      this.refreshConnectionSelectOptions();
      this.updateHeaderDefaultHints();
      this.updateButtonState();
    }
  }

  private renderHeaderControls(container: HTMLElement): void {
    container.innerHTML = '';

    // 连接选择（若宿主提供 listConnections）
    if (typeof (this.config && this.config.listConnections) === 'function') {
      const label = document.createElement('span');
      label.className = this.css.headerLabel;
      label.textContent = '模型';
      container.appendChild(label);

      const select = document.createElement('select');
      select.className = this.css.headerControl;
      select.title = '模型连接（来自 QNotes AI 模型管理）';
      this.connSelectEl = select;
      this.refreshConnectionSelectOptions();
      select.value = this.data.connectionId != null ? String(this.data.connectionId) : '';
      select.addEventListener('change', () => {
        const v = select.value;
        const id = v ? parseInt(v, 10) : null;
        this.data.connectionId = Number.isInteger(id) ? id : null;
        this.updateHeaderDefaultHints();
      });
      container.appendChild(select);
    } else {
      this.connSelectEl = null;
    }

    // 温度
    {
      const label = document.createElement('span');
      label.className = this.css.headerLabel;
      label.textContent = '温度';
      container.appendChild(label);

      const input = document.createElement('input');
      input.className = this.css.headerControl;
      input.type = 'number';
      input.step = '0.1';
      input.min = '0';
      input.max = '2';
      input.placeholder = 'T';
      input.title = '温度 temperature（留空=跟随连接默认/后端默认）';
      input.value = (typeof this.data.temperature === 'number') ? String(this.data.temperature) : '';
      input.addEventListener('input', () => {
        const s = input.value.trim();
        if (!s) {
          this.data.temperature = null;
          this.updateHeaderDefaultHints();
          return;
        }
        const n = Number(s);
        this.data.temperature = Number.isFinite(n) ? n : null;
      });
      this.temperatureInputEl = input;
      container.appendChild(input);
    }

    // 长度（K tokens）
    {
      const label = document.createElement('span');
      label.className = this.css.headerLabel;
      label.textContent = '长度（K tokens）';
      container.appendChild(label);

      const input = document.createElement('input');
      input.className = this.css.headerControl;
      input.type = 'number';
      input.step = '0.5';
      input.min = '0.5';
      input.placeholder = 'K';
      input.title = '长度（K tokens）。例如 2 表示 2000 tokens。留空=跟随连接默认/后端默认';
      input.value = (typeof this.data.maxTokens === 'number' && this.data.maxTokens > 0)
        ? String(Math.round((this.data.maxTokens / 1000) * 100) / 100)
        : '';
      input.addEventListener('input', () => {
        const s = input.value.trim();
        if (!s) {
          this.data.maxTokens = null;
          this.updateHeaderDefaultHints();
          return;
        }
        const k = Number(s);
        if (!Number.isFinite(k) || k <= 0) {
          this.data.maxTokens = null;
          this.updateHeaderDefaultHints();
          return;
        }
        this.data.maxTokens = Math.max(1, Math.round(k * 1000));
      });
      this.maxTokensKInputEl = input;
      container.appendChild(input);
    }

    this.updateButtonState();
    this.updateHeaderDefaultHints();
  }

  private refreshConnectionSelectOptions(): void {
    const select = this.connSelectEl;
    if (!select) return;
    const prev = select.value;
    select.innerHTML = '';

    const optDefault = document.createElement('option');
    optDefault.value = '';
    const def = this.findDefaultConnection();
    const defName = def && def.name ? String(def.name) : '';
    optDefault.textContent = defName ? ('默认（' + defName + '）') : '默认';
    select.appendChild(optDefault);

    if (this.isConnectionsLoading) {
      const optLoading = document.createElement('option');
      optLoading.value = '__loading__';
      optLoading.textContent = '加载中…';
      select.appendChild(optLoading);
      select.value = prev || '';
      return;
    }

    const items = (this.connections || []).slice();
    items.sort((a, b) => {
      const ad = a && (a.is_default === 1 || a.is_default === true) ? 0 : 1;
      const bd = b && (b.is_default === 1 || b.is_default === true) ? 0 : 1;
      if (ad !== bd) return ad - bd;
      const an = (a && a.name) ? String(a.name) : '';
      const bn = (b && b.name) ? String(b.name) : '';
      if (an && bn) return an.localeCompare(bn, 'zh-CN');
      return (a.id || 0) - (b.id || 0);
    });

    items.forEach((c) => {
      const active = !(c.is_active === 0 || c.is_active === false);
      const opt = document.createElement('option');
      opt.value = String(c.id);
      const name = c.name ? String(c.name) : ('连接 ' + c.id);
      // 头部空间有限：只显示名称，详细信息用 title
      opt.textContent = name;
      const provider = c.provider ? String(c.provider) : '';
      const model = c.model_name ? String(c.model_name) : '';
      const extra = [provider, model].filter(Boolean).join(' / ');
      opt.title = extra ? (name + '（' + extra + '）') : name;
      opt.disabled = !active;
      select.appendChild(opt);
    });

    // 尽量恢复选择
    select.value = prev || (this.data.connectionId != null ? String(this.data.connectionId) : '');
    this.updateHeaderDefaultHints();
  }

  // ========== 全屏逻辑 ==========

  /**
   * 切换全屏状态
   */
  private toggleFullscreen(): void {
    if (this.isFullscreen) {
      this.exitFullscreen();
    } else {
      this.enterFullscreen();
    }
  }

  /**
   * 进入全屏（页面内全屏，非浏览器原生 F11）
   */
  private enterFullscreen(): void {
    if (this.isFullscreen) return;
    if (typeof document === 'undefined') return;
    if (!this.wrapper) return;

    // 如果处于折叠状态，先展开
    if (this.isCollapsed) {
      this.toggleCollapse();
    }

    // 记录原始父节点，方便退出全屏时还原
    if (!this.wrapperParentEl) {
      this.wrapperParentEl = this.wrapper.parentElement;
    }

    // 创建全屏覆盖层
    const overlay = document.createElement('div');
    overlay.className = this.css.fullscreenOverlay;

    // 将整个聊天区域移动到覆盖层下
    overlay.appendChild(this.wrapper);
    document.body.appendChild(overlay);

    this.wrapper.classList.add(this.css.fullscreen);

    if (this.fullscreenToggleBtnEl) {
      this.fullscreenToggleBtnEl.textContent = '退出全屏';
    }

    this.fullscreenOverlayEl = overlay;
    this.isFullscreen = true;

    // 全屏后滚动到底部
    this.scrollToBottom();
  }

  /**
   * 退出全屏
   */
  private exitFullscreen(): void {
    if (!this.isFullscreen) return;
    if (typeof document === 'undefined') return;

    // 将聊天区域移回原始块内
    if (this.wrapper && this.wrapperParentEl) {
      this.wrapperParentEl.appendChild(this.wrapper);
      this.wrapper.classList.remove(this.css.fullscreen);
    }

    // 移除覆盖层
    if (this.fullscreenOverlayEl && this.fullscreenOverlayEl.parentNode) {
      this.fullscreenOverlayEl.parentNode.removeChild(this.fullscreenOverlayEl);
    }
    this.fullscreenOverlayEl = null;

    if (this.fullscreenToggleBtnEl) {
      this.fullscreenToggleBtnEl.textContent = '全屏';
    }

    this.isFullscreen = false;

    // 退出全屏后滚动到底部
    this.scrollToBottom();
  }
}
