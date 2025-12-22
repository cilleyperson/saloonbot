const { createChildLogger } = require('../utils/logger');

const logger = createChildLogger('dictionary-api');

const API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en';

/**
 * Fetch definition from Free Dictionary API
 * @param {string} word - Word to look up
 * @returns {Object|null} Definition object or null if not found
 */
async function fetchDefinition(word) {
  const url = `${API_BASE}/${encodeURIComponent(word.toLowerCase())}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        logger.debug(`Word not found: ${word}`);
        return null;
      }
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    const entry = data[0];

    // Get the first meaning with definitions
    const meaning = entry.meanings?.find(m => m.definitions?.length > 0);
    if (!meaning) {
      return null;
    }

    const definition = meaning.definitions[0];

    return {
      word: entry.word,
      phonetic: entry.phonetic || null,
      partOfSpeech: meaning.partOfSpeech,
      definition: definition.definition,
      example: definition.example || null,
      synonyms: definition.synonyms?.slice(0, 3) || [],
      antonyms: definition.antonyms?.slice(0, 3) || []
    };

  } catch (error) {
    logger.error('Dictionary API error', { word, error: error.message });
    throw error;
  }
}

/**
 * Format a definition result for chat display
 * @param {Object} def - Definition object
 * @param {boolean} isCustom - Whether this is a custom definition
 * @returns {string} Formatted message
 */
function formatDefinition(def, isCustom = false) {
  if (!def) return null;

  let message = `📖 ${def.word}`;

  if (def.partOfSpeech) {
    message += ` (${def.partOfSpeech})`;
  }

  message += `: ${def.definition}`;

  if (isCustom) {
    message += ' [custom]';
  }

  return message;
}

module.exports = {
  fetchDefinition,
  formatDefinition
};
