/**
 * TOTP (Time-based One-Time Password) Utility
 *
 * Handles generation and verification of TOTP codes for 2FA.
 * Uses the otpauth library which implements RFC 6238.
 */

const { TOTP, Secret } = require('otpauth');
const QRCode = require('qrcode');
const crypto = require('crypto');
const { createChildLogger } = require('./logger');

const logger = createChildLogger('totp');

// Configuration
const ISSUER = 'Saloon Bot';
const ALGORITHM = 'SHA1';
const DIGITS = 6;
const PERIOD = 30; // seconds

/**
 * Generate a new TOTP secret
 * @returns {string} Base32-encoded secret
 */
function generateSecret() {
  // Generate 20 bytes of random data (160 bits, standard for TOTP)
  const secretBytes = crypto.randomBytes(20);
  const secret = new Secret({ buffer: secretBytes });
  return secret.base32;
}

/**
 * Create a TOTP instance for a user
 * @param {string} secret - Base32-encoded secret
 * @param {string} username - User's username (for the authenticator app label)
 * @returns {TOTP} TOTP instance
 */
function createTotp(secret, username) {
  return new TOTP({
    issuer: ISSUER,
    label: username,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
    secret: Secret.fromBase32(secret)
  });
}

/**
 * Generate a QR code data URL for authenticator app setup
 * @param {string} secret - Base32-encoded secret
 * @param {string} username - User's username
 * @returns {Promise<string>} QR code as data URL (base64 PNG)
 */
async function generateQRCode(secret, username) {
  const totp = createTotp(secret, username);
  const uri = totp.toString(); // otpauth:// URI

  try {
    const dataUrl = await QRCode.toDataURL(uri, {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      margin: 2,
      width: 256
    });
    return dataUrl;
  } catch (error) {
    logger.error('Failed to generate QR code', { error: error.message });
    throw new Error('Failed to generate QR code');
  }
}

/**
 * Verify a TOTP code
 * @param {string} secret - Base32-encoded secret
 * @param {string} code - 6-digit code from authenticator app
 * @param {string} username - User's username (for logging)
 * @returns {boolean} True if code is valid
 */
function verifyCode(secret, code, username) {
  if (!secret || !code) {
    return false;
  }

  // Normalize code - remove spaces and ensure it's a string
  const normalizedCode = String(code).replace(/\s/g, '');

  // Validate code format
  if (!/^\d{6}$/.test(normalizedCode)) {
    logger.debug(`Invalid TOTP code format for user ${username}`);
    return false;
  }

  try {
    const totp = createTotp(secret, username);

    // Validate with a window of 1 (allows for slight time drift)
    // This means the previous, current, and next codes are accepted
    const delta = totp.validate({ token: normalizedCode, window: 1 });

    if (delta !== null) {
      logger.debug(`TOTP code verified for user ${username} (delta: ${delta})`);
      return true;
    }

    logger.debug(`TOTP code verification failed for user ${username}`);
    return false;
  } catch (error) {
    logger.error(`TOTP verification error for user ${username}`, { error: error.message });
    return false;
  }
}

/**
 * Generate the otpauth:// URI for manual entry
 * @param {string} secret - Base32-encoded secret
 * @param {string} username - User's username
 * @returns {string} otpauth:// URI
 */
function getOtpAuthUri(secret, username) {
  const totp = createTotp(secret, username);
  return totp.toString();
}

/**
 * Generate backup codes
 * @param {number} count - Number of codes to generate (default: 10)
 * @returns {string[]} Array of backup codes (8 characters each)
 */
function generateBackupCodes(count = 10) {
  const codes = [];

  for (let i = 0; i < count; i++) {
    // Generate 4 bytes of random data and convert to hex
    // This gives us 8 hex characters
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(code);
  }

  return codes;
}

/**
 * Format a backup code for display (add dash in middle)
 * @param {string} code - 8-character backup code
 * @returns {string} Formatted code (e.g., "ABCD-1234")
 */
function formatBackupCode(code) {
  if (code.length !== 8) return code;
  return code.slice(0, 4) + '-' + code.slice(4);
}

/**
 * Normalize a backup code for comparison (remove dashes and spaces, uppercase)
 * @param {string} code - Backup code possibly with formatting
 * @returns {string} Normalized code
 */
function normalizeBackupCode(code) {
  return String(code).replace(/[-\s]/g, '').toUpperCase();
}

module.exports = {
  generateSecret,
  generateQRCode,
  verifyCode,
  getOtpAuthUri,
  generateBackupCodes,
  formatBackupCode,
  normalizeBackupCode,
  ISSUER,
  DIGITS,
  PERIOD
};
