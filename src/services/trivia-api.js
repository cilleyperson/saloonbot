const { createChildLogger } = require('../utils/logger');

const logger = createChildLogger('trivia-api');

const API_URL = 'https://opentdb.com/api.php';

/**
 * API request timeout in milliseconds (default: 15 seconds)
 */
const API_TIMEOUT_MS = 15000;

/**
 * HTML entity decode helper
 * @param {string} text - Text with HTML entities
 * @returns {string} Decoded text
 */
function decodeHtmlEntities(text) {
  if (!text) return text;

  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&ldquo;': '"',
    '&rdquo;': '"',
    '&lsquo;': "'",
    '&rsquo;': "'",
    '&ndash;': '-',
    '&mdash;': '-',
    '&hellip;': '...',
    '&eacute;': 'e',
    '&Eacute;': 'E',
    '&egrave;': 'e',
    '&iacute;': 'i',
    '&oacute;': 'o',
    '&uacute;': 'u',
    '&ntilde;': 'n',
    '&Ntilde;': 'N'
  };

  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  }

  // Handle numeric entities
  decoded = decoded.replace(/&#(\d+);/g, (match, code) => {
    return String.fromCharCode(parseInt(code, 10));
  });

  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (match, code) => {
    return String.fromCharCode(parseInt(code, 16));
  });

  return decoded;
}

/**
 * Fetch a trivia question from Open Trivia Database
 * @returns {Object|null} Question object or null if failed
 * @returns {string} question.question - The question text
 * @returns {string} question.correctAnswer - The correct answer
 * @returns {string[]} question.incorrectAnswers - Array of incorrect answers
 * @returns {string[]} question.allAnswers - All answers shuffled
 * @returns {string} question.difficulty - easy, medium, or hard
 * @returns {string} question.category - Category name
 */
async function fetchQuestion() {
  try {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    const response = await fetch(`${API_URL}?amount=1&category=9&type=multiple`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SaloonBot (https://github.com/twitch-saloonbot)'
      },
      signal: controller.signal
    });

    // Clear the timeout since request completed
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    // Check API response code
    if (data.response_code !== 0) {
      const errorMessages = {
        1: 'No results found',
        2: 'Invalid parameter',
        3: 'Token not found',
        4: 'Token empty',
        5: 'Rate limited - please wait'
      };
      throw new Error(errorMessages[data.response_code] || `API response code: ${data.response_code}`);
    }

    if (!data.results || data.results.length === 0) {
      logger.warn('Trivia API returned empty results');
      return null;
    }

    const question = data.results[0];

    // Decode HTML entities in all text fields
    const decodedQuestion = decodeHtmlEntities(question.question);
    const decodedCorrect = decodeHtmlEntities(question.correct_answer);
    const decodedIncorrect = question.incorrect_answers.map(decodeHtmlEntities);

    // Combine and shuffle all answers
    const allAnswers = shuffleArray([decodedCorrect, ...decodedIncorrect]);

    logger.debug('Fetched trivia question', {
      category: question.category,
      difficulty: question.difficulty
    });

    return {
      question: decodedQuestion,
      correctAnswer: decodedCorrect,
      incorrectAnswers: decodedIncorrect,
      allAnswers: allAnswers,
      difficulty: question.difficulty,
      category: decodeHtmlEntities(question.category)
    };

  } catch (error) {
    // Handle abort/timeout errors
    if (error.name === 'AbortError') {
      logger.error('Trivia API timeout', { timeoutMs: API_TIMEOUT_MS });
      throw new Error('Request timed out - trivia service is slow');
    }
    logger.error('Trivia API error', { error: error.message });
    throw error;
  }
}

/**
 * Shuffle an array using Fisher-Yates algorithm
 * @param {Array} array - Array to shuffle
 * @returns {Array} Shuffled array (new array, original not modified)
 */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Generate answer keys for chat display
 * Letters A, B, C, D for 4 answers
 * @param {string[]} answers - Array of answer strings
 * @returns {Object[]} Array of {key, answer} objects
 */
function generateAnswerKeys(answers) {
  const keys = ['A', 'B', 'C', 'D'];
  return answers.map((answer, index) => ({
    key: keys[index],
    answer: answer
  }));
}

/**
 * Find the correct answer key from keyed answers
 * @param {Object[]} keyedAnswers - Array from generateAnswerKeys
 * @param {string} correctAnswer - The correct answer text
 * @returns {string} The key (A, B, C, or D) for the correct answer
 */
function getCorrectKey(keyedAnswers, correctAnswer) {
  const correct = keyedAnswers.find(ka => ka.answer === correctAnswer);
  return correct ? correct.key : null;
}

module.exports = {
  fetchQuestion,
  generateAnswerKeys,
  getCorrectKey,
  decodeHtmlEntities
};
