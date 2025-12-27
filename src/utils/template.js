/**
 * Template utility for formatting messages with variable substitution
 */

const sanitizeHtml = require('sanitize-html');

/**
 * Format a template string with variable substitution
 * Variables are in the format {variableName}
 *
 * @param {string} template - The template string with {variable} placeholders
 * @param {Object} variables - Object containing variable values
 * @returns {string} The formatted string
 *
 * @example
 * formatTemplate('Hello {user}!', { user: 'StreamerName' })
 * // Returns: 'Hello StreamerName!'
 */
function formatTemplate(template, variables = {}) {
  if (!template) return '';

  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = variables[key];
    if (value !== undefined && value !== null) {
      return String(value);
    }
    return match; // Keep original placeholder if variable not found
  });
}

/**
 * Strip HTML tags from a string using sanitize-html library
 * Removes all HTML tags, comments, and dangerous content while preserving text
 *
 * @param {string} text - The text containing HTML to strip
 * @returns {string} Text with HTML removed
 */
function stripHtmlTags(text) {
  if (!text || typeof text !== 'string') return '';

  // Use sanitize-html with no allowed tags to strip all HTML
  // This handles all edge cases including malformed tags, comments, and XSS vectors
  return sanitizeHtml(text, {
    allowedTags: [],
    allowedAttributes: {},
    // Don't encode entities - we handle that separately with the 'he' library
    disallowedTagsMode: 'discard'
  });
}

/**
 * Sanitize a message to prevent abuse
 * - Removes @everyone and @here mentions
 * - Trims whitespace
 * - Limits length
 *
 * @param {string} message - The message to sanitize
 * @param {number} maxLength - Maximum message length (default 500 for Twitch)
 * @returns {string} The sanitized message
 */
function sanitizeMessage(message, maxLength = 500) {
  if (!message) return '';

  let sanitized = message
    // Remove potential mass mention attempts
    .replace(/@(everyone|here)/gi, '')
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    .trim();

  // Truncate if too long
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength - 3) + '...';
  }

  return sanitized;
}

/**
 * Format subscription tier from Twitch format to human readable
 *
 * @param {string} tier - Tier value ('1000', '2000', '3000', or 'Prime')
 * @returns {string} Human readable tier name
 */
function formatTier(tier) {
  const tierMap = {
    '1000': 'Tier 1',
    '2000': 'Tier 2',
    '3000': 'Tier 3',
    'Prime': 'Prime'
  };
  return tierMap[tier] || tier;
}

/**
 * Format a number with commas for readability
 *
 * @param {number} num - The number to format
 * @returns {string} Formatted number string
 */
function formatNumber(num) {
  return num.toLocaleString();
}

/**
 * Parse template variables from a template string
 *
 * @param {string} template - The template string
 * @returns {string[]} Array of variable names found
 */
function parseTemplateVariables(template) {
  if (!template) return [];

  const matches = template.match(/\{(\w+)\}/g);
  if (!matches) return [];

  return [...new Set(matches.map(m => m.slice(1, -1)))];
}

module.exports = {
  formatTemplate,
  stripHtmlTags,
  sanitizeMessage,
  formatTier,
  formatNumber,
  parseTemplateVariables
};
