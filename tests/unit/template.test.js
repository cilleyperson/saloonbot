/**
 * Template Utility Tests
 */

const { stripHtmlTags, sanitizeMessage, formatTemplate } = require('../../src/utils/template');

describe('Template Utilities', () => {
  describe('stripHtmlTags', () => {
    it('should remove complete HTML tags', () => {
      expect(stripHtmlTags('<p>Hello</p>')).toBe('Hello');
      expect(stripHtmlTags('<div><span>Test</span></div>')).toBe('Test');
      expect(stripHtmlTags('<a href="http://example.com">Link</a>')).toBe('Link');
    });

    it('should remove self-closing tags', () => {
      expect(stripHtmlTags('Hello<br/>World')).toBe('HelloWorld');
      expect(stripHtmlTags('Test<hr />content')).toBe('Testcontent');
    });

    it('should remove incomplete/partial tags', () => {
      // Partial tag without closing ">"
      expect(stripHtmlTags('Hello<script alert("xss")')).toBe('Hello');
      expect(stripHtmlTags('Test<div class="foo')).toBe('Test');
    });

    it('should remove dangerous elements including their content', () => {
      // Script, style, iframe, object, embed elements have content removed entirely
      expect(stripHtmlTags('Hello<script>evil()</script>World')).toBe('HelloWorld');
      expect(stripHtmlTags('Test<style>body{}</style>content')).toBe('Testcontent');
      expect(stripHtmlTags('A<iframe src="x">frame content</iframe>C')).toBe('AC');
      expect(stripHtmlTags('X<object data="y">object content</object>W')).toBe('XW');
      expect(stripHtmlTags('P<embed src="z">Q')).toBe('PQ');
      expect(stripHtmlTags('P<noscript>hidden</noscript>Q')).toBe('PQ');
    });

    it('should remove other HTML tags but keep their text content', () => {
      // Form elements - tags removed but text preserved
      expect(stripHtmlTags('M<form action="a">N</form>O')).toBe('MNO');
      expect(stripHtmlTags('R<input type="text">S')).toBe('RS');
      expect(stripHtmlTags('T<button>U</button>V')).toBe('TUV');
      expect(stripHtmlTags('G<link href="h">I')).toBe('GI');
      expect(stripHtmlTags('J<meta charset="k">L')).toBe('JL');
    });

    it('should remove HTML comments', () => {
      expect(stripHtmlTags('Hello<!-- comment -->World')).toBe('HelloWorld');
      expect(stripHtmlTags('Test<!-- multi\nline\ncomment -->content')).toBe('Testcontent');
    });

    it('should handle nested tags', () => {
      expect(stripHtmlTags('<div><p><span>Deep</span></p></div>')).toBe('Deep');
    });

    it('should preserve < symbols in safe contexts', () => {
      // "<" followed by space is preserved (not a tag)
      expect(stripHtmlTags('5 < 10')).toBe('5 < 10');
      // "<" followed by number is preserved
      expect(stripHtmlTags('x < 5')).toBe('x < 5');
    });

    it('should aggressively remove potential partial tags at end of string', () => {
      // For security, partial tags at end of string are removed
      // This is intentional: false positives are safer than false negatives
      expect(stripHtmlTags('text<div')).toBe('text');
      expect(stripHtmlTags('text<script')).toBe('text');
    });

    it('should handle empty and null inputs', () => {
      expect(stripHtmlTags('')).toBe('');
      expect(stripHtmlTags(null)).toBe('');
      expect(stripHtmlTags(undefined)).toBe('');
    });

    it('should handle text with no HTML', () => {
      expect(stripHtmlTags('Plain text with no HTML')).toBe('Plain text with no HTML');
    });
  });

  describe('sanitizeMessage', () => {
    it('should remove @everyone and @here mentions', () => {
      expect(sanitizeMessage('Hello @everyone!')).toBe('Hello !');
      expect(sanitizeMessage('Hey @here check this')).toBe('Hey check this');
      // After removing mentions and normalizing whitespace, leading spaces are trimmed
      expect(sanitizeMessage('@EVERYONE @HERE test')).toBe('test');
    });

    it('should normalize whitespace', () => {
      expect(sanitizeMessage('Hello    World')).toBe('Hello World');
      expect(sanitizeMessage('Multiple   spaces   here')).toBe('Multiple spaces here');
    });

    it('should truncate long messages', () => {
      const longMessage = 'A'.repeat(600);
      const result = sanitizeMessage(longMessage);
      expect(result.length).toBe(500);
      expect(result.endsWith('...')).toBe(true);
    });

    it('should handle empty input', () => {
      expect(sanitizeMessage('')).toBe('');
      expect(sanitizeMessage(null)).toBe('');
    });
  });

  describe('formatTemplate', () => {
    it('should replace variables', () => {
      expect(formatTemplate('Hello {user}!', { user: 'John' })).toBe('Hello John!');
      expect(formatTemplate('{a} + {b} = {c}', { a: 1, b: 2, c: 3 })).toBe('1 + 2 = 3');
    });

    it('should keep unknown placeholders', () => {
      expect(formatTemplate('Hello {unknown}!', {})).toBe('Hello {unknown}!');
    });

    it('should handle empty input', () => {
      expect(formatTemplate('', {})).toBe('');
      expect(formatTemplate(null, {})).toBe('');
    });
  });
});
