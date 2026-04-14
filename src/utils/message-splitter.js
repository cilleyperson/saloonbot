/**
 * Message splitting utility for Twitch chat messages
 * Twitch has a 500 character limit per message
 */

const MAX_LENGTH = 490; // Buffer for safety

/**
 * Build chunks without any suffixes.
 * @param {string} text
 * @param {number} chunkLength
 * @returns {string[]}
 */
function buildChunks(text, chunkLength) {
  const chunks = [];
  const words = text.split(' ');
  let currentChunk = '';

  for (const word of words) {
    const testChunk = currentChunk ? `${currentChunk} ${word}` : word;

    if (testChunk.length <= chunkLength) {
      currentChunk = testChunk;
      continue;
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    if (word.length > chunkLength) {
      let remaining = word;
      while (remaining.length > 0) {
        chunks.push(remaining.slice(0, chunkLength));
        remaining = remaining.slice(chunkLength);
      }
      currentChunk = '';
    } else {
      currentChunk = word;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

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

  // First pass without suffix budget; if only one chunk we avoid unnecessary splitting.
  let chunks = buildChunks(text, maxLength);

  if (chunks.length <= 1) {
    return chunks;
  }

  // Reserve exact suffix size based on final chunk count. Rebuild until count is stable.
  let previousCount = 0;
  while (chunks.length !== previousCount) {
    previousCount = chunks.length;
    const suffixLength = ` (${previousCount}/${previousCount})`.length;
    const availableLength = Math.max(1, maxLength - suffixLength);
    chunks = buildChunks(text, availableLength);
  }

  return chunks.map((chunk, i) => `${chunk} (${i + 1}/${chunks.length})`);
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
