import { describe, expect, it } from 'vitest';
import { analyzeRichText } from '../richtext';

describe('rich text analysis', () => {
  it('extracts plain text and mentions', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '你好 ' },
            { type: 'mention', attrs: { id: 'user_1', label: 'Alice' } },
            { type: 'text', text: ' 请看这个任务' },
          ],
        },
        {
          type: 'mention',
          attrs: { id: 'user_1', label: 'Alice' },
        },
        {
          type: 'mention',
          attrs: { id: 'user_2' },
        },
      ],
    };
    const result = analyzeRichText(doc);
    expect(result.text).toBe('你好 请看这个任务');
    expect(result.mentions).toEqual(['user_1', 'user_2']);
  });

  it('ignores malformed nodes', () => {
    expect(analyzeRichText(null)).toEqual({ text: '', mentions: [] });
    expect(
      analyzeRichText({
        type: 'doc',
        content: [
          { type: 'mention', attrs: { id: 42 } },
          { type: 'text', text: 'ok' },
        ],
      }),
    ).toEqual({ text: 'ok', mentions: [] });
  });
});
