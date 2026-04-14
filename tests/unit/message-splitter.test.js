const { splitMessage, joinChunks } = require('../../src/utils/message-splitter');

describe('message splitter', () => {
  it('does not split a single long word that still fits maxLength', () => {
    const word = 'a'.repeat(485);
    const chunks = splitMessage(word, 490);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(word);
  });

  it('keeps every chunk within maxLength after numbering suffixes are added', () => {
    const longWord = 'b'.repeat(5000);
    const chunks = splitMessage(longWord, 490);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every(chunk => chunk.length <= 490)).toBe(true);
  });

  it('can round-trip split and join text', () => {
    const text = 'hello world this is a longer message '.repeat(50).trim();
    const chunks = splitMessage(text, 80);

    expect(joinChunks(chunks)).toBe(text);
  });
});
