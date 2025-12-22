const crypto = require('crypto');

/**
 * Encryption utility for securing sensitive data using AES-256-GCM
 *
 * Format: base64(IV[12 bytes] + encrypted data + auth tag[16 bytes])
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

/**
 * Encrypt plaintext using AES-256-GCM
 *
 * @param {string} plaintext - The text to encrypt
 * @param {string} key - 32-byte key as hex string (64 characters)
 * @returns {string} Base64-encoded encrypted data with IV and auth tag
 * @throws {Error} If key is invalid or encryption fails
 */
function encrypt(plaintext, key) {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('Plaintext must be a non-empty string');
  }

  if (!key || typeof key !== 'string' || key.length !== 64) {
    throw new Error('Key must be a 64-character hex string (32 bytes)');
  }

  // Convert hex key to buffer
  const keyBuffer = Buffer.from(key, 'hex');

  if (keyBuffer.length !== KEY_LENGTH) {
    throw new Error('Key must be exactly 32 bytes');
  }

  // Generate random IV
  const iv = crypto.randomBytes(IV_LENGTH);

  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

  // Encrypt the plaintext
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);

  // Get authentication tag
  const authTag = cipher.getAuthTag();

  // Combine IV + encrypted data + auth tag
  const combined = Buffer.concat([iv, encrypted, authTag]);

  // Return as base64
  return combined.toString('base64');
}

/**
 * Decrypt encrypted data using AES-256-GCM
 *
 * @param {string} encryptedData - Base64-encoded encrypted data with IV and auth tag
 * @param {string} key - 32-byte key as hex string (64 characters)
 * @returns {string} Decrypted plaintext
 * @throws {Error} If key is invalid, data is corrupted, or authentication fails
 */
function decrypt(encryptedData, key) {
  if (!encryptedData || typeof encryptedData !== 'string') {
    throw new Error('Encrypted data must be a non-empty string');
  }

  if (!key || typeof key !== 'string' || key.length !== 64) {
    throw new Error('Key must be a 64-character hex string (32 bytes)');
  }

  // Convert hex key to buffer
  const keyBuffer = Buffer.from(key, 'hex');

  if (keyBuffer.length !== KEY_LENGTH) {
    throw new Error('Key must be exactly 32 bytes');
  }

  // Decode base64
  let combined;
  try {
    combined = Buffer.from(encryptedData, 'base64');
  } catch (error) {
    throw new Error('Invalid base64 encrypted data');
  }

  // Minimum length check: IV + at least 1 byte + auth tag
  const minLength = IV_LENGTH + 1 + AUTH_TAG_LENGTH;
  if (combined.length < minLength) {
    throw new Error('Encrypted data is too short to be valid');
  }

  // Extract components
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH);

  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(authTag);

  // Decrypt
  try {
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    return decrypted.toString('utf8');
  } catch (error) {
    throw new Error('Decryption failed: data may be corrupted or key is incorrect');
  }
}

/**
 * Generate a random 32-byte encryption key
 *
 * @returns {string} Random key as hex string (64 characters)
 */
function generateKey() {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

/**
 * Check if data appears to be encrypted by this module
 * Useful for migration scenarios where some data may already be encrypted
 *
 * @param {string} data - Data to check
 * @returns {boolean} True if data looks like it was encrypted by this module
 */
function isEncrypted(data) {
  if (!data || typeof data !== 'string') {
    return false;
  }

  // Check if it's valid base64
  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  if (!base64Regex.test(data)) {
    return false;
  }

  // Try to decode and check minimum length
  try {
    const buffer = Buffer.from(data, 'base64');
    const minLength = IV_LENGTH + 1 + AUTH_TAG_LENGTH;
    return buffer.length >= minLength;
  } catch (error) {
    return false;
  }
}

module.exports = {
  encrypt,
  decrypt,
  generateKey,
  isEncrypted
};
