interface RichTextNode {
  type?: string;
  text?: string;
  attrs?: { id?: unknown; label?: unknown } & Record<string, unknown>;
  content?: unknown;
}

function isNode(value: unknown): value is RichTextNode {
  return typeof value === 'object' && value !== null;
}

export interface RichTextAnalysis {
  text: string;
  mentions: string[];
}

export function analyzeRichText(doc: unknown): RichTextAnalysis {
  const texts: string[] = [];
  const mentions = new Set<string>();

  const walk = (node: unknown): void => {
    if (!isNode(node)) return;
    if (typeof node.text === 'string') texts.push(node.text);
    if (node.type === 'mention' && typeof node.attrs?.id === 'string') {
      const id = node.attrs.id.trim();
      if (id.length > 0 && id.length <= 64) mentions.add(id);
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) walk(child);
    }
  };

  walk(doc);
  return { text: texts.join(' ').replace(/\s+/g, ' ').trim(), mentions: [...mentions] };
}

export function plainTextLength(doc: unknown): number {
  return analyzeRichText(doc).text.length;
}
