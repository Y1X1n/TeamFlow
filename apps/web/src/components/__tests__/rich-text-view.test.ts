import { describe, expect, it } from 'vitest';
import { safeRichTextHref } from '../rich-text-view';

describe('safeRichTextHref', () => {
  it('allows http, https and mailto links', () => {
    expect(safeRichTextHref('https://example.com/a')).toBe('https://example.com/a');
    expect(safeRichTextHref('http://example.com')).toBe('http://example.com');
    expect(safeRichTextHref('mailto:alice@example.com')).toBe('mailto:alice@example.com');
    expect(safeRichTextHref('/projects/1')).toBe('/projects/1');
  });

  it('rejects script and data URLs', () => {
    expect(safeRichTextHref('javascript:alert(1)')).toBeNull();
    expect(safeRichTextHref('JavaScript:alert(1)')).toBeNull();
    expect(safeRichTextHref('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeRichTextHref('   ')).toBeNull();
    expect(safeRichTextHref(null)).toBeNull();
  });
});
