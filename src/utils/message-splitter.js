/**
 * Message splitting utility for Twitch chat messages
 * Twitch has a 500 character limit per message
 */

const MAX_LENGTH = 490; // Buffer for safety
const SUFFIX_LENGTH = 10; // " (1/10)" worst case

/**
 * Split a long message into chunks that fit Twitch limits
 * @param {string} text - Text to split
 * @param {number} maxLength - Maximum length per chunk (default: 490)
 * @returns {string[]} Array of message chunks
 */
function splitMessage(text, maxLength = MAX_LENGTH) {
  if (!text || text.length <= maxLength) {
    return [text];
  }

  const chunks = [];
  const words = text.split(' ');
  let currentChunk = '';

  for (const word of words) {
    const testChunk = currentChunk ? `${currentChunk} ${word}` : word;

    if (testChunk.length <= maxLength - SUFFIX_LENGTH) {
      currentChunk = testChunk;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      // If a single word is longer than max, split it
      if (word.length > maxLength - SUFFIX_LENGTH) {
        let remaining = word;
        while (remaining.length > 0) {
          const piece = remaining.slice(0, maxLength - SUFFIX_LENGTH);
          chunks.push(piece);
          remaining = remaining.slice(maxLength - SUFFIX_LENGTH);
        }
        currentChunk = '';
      } else {
        currentChunk = word;
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  // Add part numbers if multiple chunks
  if (chunks.length > 1) {
    return chunks.map((chunk, i) => `${chunk} (${i + 1}/${chunks.length})`);
  }

  return chunks;
}

/**
 * Join chunks back together (for testing/debugging)
 * @param {string[]} chunks - Array of message chunks
 * @returns {string} Joined message
 */
function joinChunks(chunks) {
  if (!chunks || chunks.length === 0) return '';

  return chunks.map(chunk => {
    // Remove part numbers like " (1/3)"
    return chunk.replace(/\s*\(\d+\/\d+\)$/, '');
  }).join(' ');
}

module.exports = {
  splitMessage,
  joinChunks,
  MAX_LENGTH
};
