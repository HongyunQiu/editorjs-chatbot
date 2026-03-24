/**
 * chatRenderer.ts
 * Markdown / 代码高亮 / 数学公式 渲染器
 * 使用 marked + highlight.js + katex
 */

import { Marked } from 'marked';
import hljs from 'highlight.js/lib/core';
import katex from 'katex';

// 按需注册常用语言（控制打包体积）
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import markdown from 'highlight.js/lib/languages/markdown';
import yaml from 'highlight.js/lib/languages/yaml';
import php from 'highlight.js/lib/languages/php';
import ruby from 'highlight.js/lib/languages/ruby';
import swift from 'highlight.js/lib/languages/swift';
import kotlin from 'highlight.js/lib/languages/kotlin';
import lua from 'highlight.js/lib/languages/lua';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('java', java);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('c++', cpp);
hljs.registerLanguage('c', cpp);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('cs', csharp);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('php', php);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('rb', ruby);
hljs.registerLanguage('swift', swift);
hljs.registerLanguage('kotlin', kotlin);
hljs.registerLanguage('kt', kotlin);
hljs.registerLanguage('lua', lua);

/**
 * 处理 LaTeX 公式：支持 $...$ (行内) 和 $$...$$ (块级)
 * 在 marked 解析之前预处理
 */
function renderKatexFormula(formula: string, displayMode: boolean): string {
  try {
    return katex.renderToString(formula.trim(), { displayMode, throwOnError: false });
  } catch {
    return '<span class="cdx-chatbot__katex-error">' + escapeHtml(formula) + '</span>';
  }
}

function renderLatex(text: string): string {
  const replacements: Array<{ pattern: RegExp; displayMode: boolean }> = [
    // 块级公式 $$...$$
    { pattern: /\$\$([\s\S]+?)\$\$/g, displayMode: true },
    // 块级公式 \[...\]
    { pattern: /\\\[([\s\S]+?)\\\]/g, displayMode: true },
    // 行内公式 \(...\)
    { pattern: /\\\(([\s\S]+?)\\\)/g, displayMode: false },
    // 行内公式 $...$（尽量避免误伤货币金额）
    { pattern: /(?<!\$)\$(?![\s$])([\s\S]*?[^\s$])\$(?!\$)/g, displayMode: false },
  ];

  let rendered = text;
  for (const { pattern, displayMode } of replacements) {
    rendered = rendered.replace(pattern, (_match, formula) => renderKatexFormula(formula, displayMode));
  }

  return rendered;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 创建 Marked 实例并配置代码高亮
 */
const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    code({ text, lang }: { text: string; lang?: string | undefined }) {
      const language = lang && hljs.getLanguage(lang) ? lang : '';
      let highlighted: string;
      if (language) {
        highlighted = hljs.highlight(text, { language }).value;
      } else {
        // 尝试自动检测
        try {
          highlighted = hljs.highlightAuto(text).value;
        } catch {
          highlighted = escapeHtml(text);
        }
      }
      const langLabel = language || 'code';
      return (
        '<div class="cdx-chatbot__code-block">' +
        '<div class="cdx-chatbot__code-header">' +
        '<span class="cdx-chatbot__code-lang">' + escapeHtml(langLabel) + '</span>' +
        '<button class="cdx-chatbot__code-copy" title="复制代码">复制</button>' +
        '</div>' +
        '<pre><code class="hljs' + (language ? ' language-' + language : '') + '">' +
        highlighted +
        '</code></pre>' +
        '</div>'
      );
    },
    codespan({ text }: { text: string }) {
      return '<code class="cdx-chatbot__inline-code">' + text + '</code>';
    }
  }
});

/**
 * 将 Markdown 文本渲染为 HTML
 * 处理顺序：LaTeX -> Markdown (含代码高亮)
 */
export function renderMarkdown(text: string): string {
  if (!text) return '';

  // 先保护代码块中的 LaTeX 符号，避免被错误解析
  const codeBlocks: string[] = [];
  let processed = text.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `___CODEBLOCK_${codeBlocks.length - 1}___`;
  });

  const inlineCodes: string[] = [];
  processed = processed.replace(/`[^`]+`/g, (match) => {
    inlineCodes.push(match);
    return `___INLINECODE_${inlineCodes.length - 1}___`;
  });

  // 渲染 LaTeX
  processed = renderLatex(processed);

  // 恢复代码块
  processed = processed.replace(/___INLINECODE_(\d+)___/g, (_m, i) => inlineCodes[parseInt(i)] || '');
  processed = processed.replace(/___CODEBLOCK_(\d+)___/g, (_m, i) => codeBlocks[parseInt(i)] || '');

  // 渲染 Markdown
  const html = marked.parse(processed);
  return typeof html === 'string' ? html : '';
}

/**
 * 为代码块的"复制"按钮绑定事件
 * 需要在 innerHTML 设置后调用
 */
export function bindCodeCopyButtons(container: HTMLElement): void {
  const buttons = container.querySelectorAll('.cdx-chatbot__code-copy');
  buttons.forEach((btn) => {
    // 避免重复绑定
    if ((btn as HTMLElement).dataset.bound === '1') return;
    (btn as HTMLElement).dataset.bound = '1';
    btn.addEventListener('click', () => {
      const codeBlock = btn.closest('.cdx-chatbot__code-block');
      if (!codeBlock) return;
      const codeEl = codeBlock.querySelector('code');
      if (!codeEl) return;
      const text = codeEl.textContent || '';
      navigator.clipboard.writeText(text).then(() => {
        const original = btn.textContent;
        btn.textContent = '已复制';
        setTimeout(() => {
          btn.textContent = original;
        }, 1500);
      }).catch(() => {
        // fallback
        btn.textContent = '复制失败';
        setTimeout(() => { btn.textContent = '复制'; }, 1500);
      });
    });
  });
}
