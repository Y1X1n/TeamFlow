import type { ReactNode } from 'react';

interface Node {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown> & { id?: string; label?: string; level?: number };
  content?: Node[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** 只允许常见链接协议，阻止 javascript:/data: 等存储型 XSS。 */
export function safeRichTextHref(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed, 'https://teamflow.local');
    return SAFE_LINK_PROTOCOLS.has(url.protocol) ? trimmed : null;
  } catch {
    return null;
  }
}

function renderText(node: Node, key: number): ReactNode {
  let content: ReactNode = node.text ?? '';
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') content = <strong>{content}</strong>;
    if (mark.type === 'italic') content = <em>{content}</em>;
    if (mark.type === 'code') content = <code>{content}</code>;
    if (mark.type === 'strike') content = <s>{content}</s>;
    if (mark.type === 'link') {
      const href = safeRichTextHref(mark.attrs?.href);
      if (href) {
        content = (
          <a className="text-primary underline" href={href} target="_blank" rel="noreferrer">
            {content}
          </a>
        );
      }
    }
  }
  return <span key={key}>{content}</span>;
}

function renderNode(node: Node, key: number): ReactNode {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'text') return renderText(node, key);
  if (node.type === 'mention') {
    return (
      <span key={key} className="mention">
        @{node.attrs?.label ?? '成员'}
      </span>
    );
  }
  if (node.type === 'hardBreak') return <br key={key} />;

  const children = (node.content ?? []).map((child, index) => renderNode(child, index));
  switch (node.type) {
    case 'doc':
      return <div key={key}>{children}</div>;
    case 'paragraph':
      return <p key={key}>{children}</p>;
    case 'heading': {
      const level = node.attrs?.level ?? 2;
      return level === 1 ? <h1 key={key}>{children}</h1> : <h2 key={key}>{children}</h2>;
    }
    case 'bulletList':
      return <ul key={key}>{children}</ul>;
    case 'orderedList':
      return <ol key={key}>{children}</ol>;
    case 'listItem':
      return <li key={key}>{children}</li>;
    case 'blockquote':
      return <blockquote key={key}>{children}</blockquote>;
    case 'codeBlock':
      return (
        <pre key={key} className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
          <code>{children}</code>
        </pre>
      );
    default:
      return <div key={key}>{children}</div>;
  }
}

export function RichTextView({ doc }: { doc: Record<string, unknown> | null | undefined }) {
  if (!doc) return <p className="text-sm text-muted-foreground">暂无内容</p>;
  return <div className="rich-text">{renderNode(doc as Node, 0)}</div>;
}
