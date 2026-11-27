import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface SafeMarkdownProps {
  content: string;
  className?: string;
}

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`\n]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s<)]+[^<.,;:!?"')\s]|\*[^*\n]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${keyPrefix}-${idx++}`;

    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={key} className="font-semibold text-inherit">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={key}
          className="px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 font-mono text-[0.88em] text-amber-700 dark:text-amber-300"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('[')) {
      const mLink = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (mLink) {
        parts.push(
          <a
            key={key}
            href={mLink[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-sky-600 dark:text-sky-400 hover:text-sky-500 dark:hover:text-sky-300 break-words"
          >
            {mLink[1]}
          </a>
        );
      } else {
        parts.push(token);
      }
    } else if (token.startsWith('http://') || token.startsWith('https://')) {
      parts.push(
        <a
          key={key}
          href={token}
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-sky-600 dark:text-sky-400 hover:text-sky-500 dark:hover:text-sky-300 break-all"
        >
          {token}
        </a>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <em key={key} className="italic opacity-90">
          {token.slice(1, -1)}
        </em>
      );
    } else {
      parts.push(token);
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

const CodeBlock: React.FC<{ language: string; code: string }> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore clipboard denial */
    }
  };

  return (
    <div className="my-2 rounded-xl overflow-hidden border border-white/15 bg-[#090d14] text-slate-100">
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/5 border-b border-white/10 text-[10px] text-slate-400">
        <span className="font-mono uppercase">{language || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 hover:text-slate-100 cursor-pointer"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-xs font-mono leading-relaxed">{code}</pre>
    </div>
  );
};

/**
 * Dependency-free, XSS-safe Markdown renderer (never uses dangerouslySetInnerHTML).
 */
export const SafeMarkdown: React.FC<SafeMarkdownProps> = ({ content, className = '' }) => {
  const segments: Array<{ type: 'text' | 'code'; content: string; lang?: string }> = [];
  const raw = String(content || '');
  const fenceRe = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = fenceRe.exec(raw)) !== null) {
    if (m.index > last) {
      segments.push({ type: 'text', content: raw.slice(last, m.index) });
    }
    segments.push({ type: 'code', lang: m[1] || '', content: m[2].replace(/\n$/, '') });
    last = fenceRe.lastIndex;
  }
  if (last < raw.length) {
    segments.push({ type: 'text', content: raw.slice(last) });
  }

  return (
    <div className={`space-y-1.5 break-words ${className}`}>
      {segments.map((seg, sIdx) => {
        if (seg.type === 'code') {
          return <CodeBlock key={`cb-${sIdx}`} language={seg.lang || ''} code={seg.content} />;
        }

        const lines = seg.content.split(/\r?\n/);
        const nodes: React.ReactNode[] = [];
        let listItems: string[] = [];
        let listOrdered = false;

        const flushList = (keySeed: string) => {
          if (listItems.length === 0) return;
          const ListTag = listOrdered ? 'ol' : 'ul';
          nodes.push(
            <ListTag
              key={`list-${keySeed}`}
              className={`${listOrdered ? 'list-decimal' : 'list-disc'} pl-5 space-y-0.5 text-[0.95em]`}
            >
              {listItems.map((item, idx) => (
                <li key={`${keySeed}-${idx}`}>{renderInline(item, `${keySeed}-li-${idx}`)}</li>
              ))}
            </ListTag>
          );
          listItems = [];
        };

        lines.forEach((line, lIdx) => {
          const trimmed = line.trim();
          const ulMatch = trimmed.match(/^[-*•]\s+(.+)$/);
          const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);

          if (ulMatch) {
            if (listItems.length > 0 && listOrdered) flushList(`${sIdx}-${lIdx}-pre`);
            listOrdered = false;
            listItems.push(ulMatch[1]);
            return;
          }
          if (olMatch) {
            if (listItems.length > 0 && !listOrdered) flushList(`${sIdx}-${lIdx}-pre`);
            listOrdered = true;
            listItems.push(olMatch[1]);
            return;
          }

          flushList(`${sIdx}-${lIdx}`);

          if (!trimmed) {
            nodes.push(<div key={`sp-${sIdx}-${lIdx}`} className="h-1" />);
            return;
          }
          if (trimmed.startsWith('### ')) {
            nodes.push(
              <h4 key={`h3-${sIdx}-${lIdx}`} className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 pt-1">
                {renderInline(trimmed.slice(4), `h3-${sIdx}-${lIdx}`)}
              </h4>
            );
            return;
          }
          if (trimmed.startsWith('## ')) {
            nodes.push(
              <h3 key={`h2-${sIdx}-${lIdx}`} className="text-sm font-bold pt-1">
                {renderInline(trimmed.slice(3), `h2-${sIdx}-${lIdx}`)}
              </h3>
            );
            return;
          }
          if (trimmed.startsWith('# ')) {
            nodes.push(
              <h2 key={`h1-${sIdx}-${lIdx}`} className="text-base font-bold pt-1">
                {renderInline(trimmed.slice(2), `h1-${sIdx}-${lIdx}`)}
              </h2>
            );
            return;
          }

          nodes.push(
            <p key={`p-${sIdx}-${lIdx}`} className="leading-relaxed">
              {renderInline(line, `p-${sIdx}-${lIdx}`)}
            </p>
          );
        });

        flushList(`${sIdx}-end`);
        return <React.Fragment key={`seg-${sIdx}`}>{nodes}</React.Fragment>;
      })}
    </div>
  );
};
