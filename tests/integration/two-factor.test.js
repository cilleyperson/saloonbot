/**
 * Two-Factor Authentication Integration Tests
 *
 * Tests the 2FA workflow components in isolation.
 */

const bcrypt = require('bcrypt');

// Generate a proper 64-character hex key for testing
const TEST_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// Mock config before anything else
jest.mock('../../src/config', () => ({
  server: {
    port: 3000,
    sessionSecret: 'test-session-secret-for-jest'
  },
  security: {
    tokenEncryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  },
  logging: {
    level: 'error'
  },
  twitch: {
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    botUsername: 'testbot'
  },
  isProduction: false,
  isDevelopment: true,
  env: 'test'
}));

// Mock the database
jest.mock('../../src/database/index', () => {
  const Database = require('better-sqlite3');
  let db = new Database(':memory:');

  const createTables = (database) => {
    database.exec(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME,
        failed_attempts INTEGER DEFAULT 0,
        locked_until DATETIME,
        totp_secret TEXT,
        totp_enabled INTEGER DEFAULT 0,
        totp_verified_at DATETIME,
        backup_codes TEXT
      );
    `);
  };

  createTables(db);

  return {
    initialize: jest.fn(),
    getDb: () => db,
    resetDb: () => {
      db = new Database(':memory:');
      createTables(db);
    }
  };
});

const adminUserRepo = require('../../src/database/repositories/admin-user-repo');
const totp = require('../../src/utils/totp');
const { encrypt, decrypt } = require('../../src/utils/crypto');

describe('Two-Factor Authentication Integration', () => {
  let testUser;

  beforeEach(async () => {
    const { resetDb, getDb } = require('../../src/database/index');
    resetDb();

    const passwordHash = await bcrypt.hash('testpassword', 10);
    const db = getDb();
    db.prepare(`
      INSERT INTO admin_users (username, password_hash)
      VALUES (?, ?)
    `).run('testuser', passwordHash);

    testUser = db.prepare('SELECT * FROM admin_users WHERE username = ?').get('testuser');
  });

  describe('TOTP Secret Storage', () => {
    it('should store and retrieve TOTP secret with encryption', () => {
      const secret = totp.generateSecret();

      // Store the secret
      adminUserRepo.storeTotpSecret(testUser.id, secret);

      // Retrieve and verify
      const retrievedSecret = adminUserRepo.getTotpSecret(testUser.id);
      expect(retrievedSecret).toBe(secret);
    });

    it('should mark 2FA as not enabled when secret is first stored', () => {
      const secret = totp.generateSecret();
      adminUserRepo.storeTotpSecret(testUser.id, secret);

      const user = adminUserRepo.findById(testUser.id);
      expect(adminUserRepo.hasTotpEnabled(user)).toBe(false);
    });
  });

  describe('TOTP Enable/Disable', () => {
    let secret;

    beforeEach(() => {
      secret = totp.generateSecret();
      adminUserRepo.storeTotpSecret(testUser.id, secret);
    });

    it('should enable 2FA after verification', () => {
      adminUserRepo.enableTotp(testUser.id);

      const user = adminUserRepo.findById(testUser.id);
      expect(adminUserRepo.hasTotpEnabled(user)).toBe(true);
      expect(user.totp_verified_at).toBeDefined();
    });

    it('should disable 2FA and clear secret', () => {
      adminUserRepo.enableTotp(testUser.id);
      adminUserRepo.disableTotp(testUser.id);

      const user = adminUserRepo.findById(testUser.id);
      expect(adminUserRepo.hasTotpEnabled(user)).toBe(false);
      expect(user.totp_secret).toBeNull();
      expect(user.backup_codes).toBeNull();
    });
  });

  describe('TOTP Code Verification', () => {
    let secret;

    beforeEach(() => {
      secret = totp.generateSecret();
      adminUserRepo.storeTotpSecret(testUser.id, secret);
    });

    it('should verify valid TOTP code', () => {
      const { TOTP, Secret } = require('otpauth');
      const totpInstance = new TOTP({
        issuer: totp.ISSUER,
        label: 'testuser',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: Secret.fromBase32(secret)
      });
      const validCode = totpInstance.generate();

      const result = totp.verifyCode(secret, validCode, 'testuser');
      expect(result).toBe(true);
    });

    it('should reject invalid TOTP code', () => {
      const result = totp.verifyCode(secret, '000000', 'testuser');
      expect(result).toBe(false);
    });
  });

  describe('Backup Codes', () => {
    it('should store and retrieve hashed backup codes', async () => {
      const rawCodes = totp.generateBackupCodes(10);
      const hashedCodes = await Promise.all(
        rawCodes.map(code => bcrypt.hash(code, 10))
      );

      adminUserRepo.storeBackupCodes(testUser.id, hashedCodes);

      const retrievedCodes = adminUserRepo.getBackupCodes(testUser.id);
      expect(retrievedCodes).toHaveLength(10);
    });

    it('should verify backup code correctly', async () => {
      const rawCodes = totp.generateBackupCodes(10);
      const hashedCodes = await Promise.all(
        rawCodes.map(code => bcrypt.hash(code, 10))
      );

      adminUserRepo.storeBackupCodes(testUser.id, hashedCodes);

      // Verify one of the codes
      const storedCodes = adminUserRepo.getBackupCodes(testUser.id);
      const normalizedCode = totp.normalizeBackupCode(rawCodes[0]);
      const isMatch = await bcrypt.compare(normalizedCode, storedCodes[0]);
      expect(isMatch).toBe(true);
    });

    it('should allow removing used backup codes', async () => {
      const rawCodes = totp.generateBackupCodes(10);
      const hashedCodes = await Promise.all(
        rawCodes.map(code => bcrypt.hash(code, 10))
      );

      adminUserRepo.storeBackupCodes(testUser.id, hashedCodes);

      // Remove first code (simulating use)
      const remainingCodes = hashedCodes.slice(1);
      adminUserRepo.updateBackupCodes(testUser.id, remainingCodes);

      const retrievedCodes = adminUserRepo.getBackupCodes(testUser.id);
      expect(retrievedCodes).toHaveLength(9);
    });
  });

  describe('Pending 2FA Setup', () => {
    it('should clear pending TOTP when not yet enabled', () => {
      const secret = totp.generateSecret();
      adminUserRepo.storeTotpSecret(testUser.id, secret);

      adminUserRepo.clearPendingTotp(testUser.id);

      const user = adminUserRepo.findById(testUser.id);
      expect(user.totp_secret).toBeNull();
    });

    it('should not clear TOTP when already enabled', () => {
      const secret = totp.generateSecret();
      adminUserRepo.storeTotpSecret(testUser.id, secret);
      adminUserRepo.enableTotp(testUser.id);

      // Get the secret before clear attempt
      const secretBefore = adminUserRepo.getTotpSecret(testUser.id);

      // Attempt to clear (should not work)
      adminUserRepo.clearPendingTotp(testUser.id);

      // Secret should still be there
      const secretAfter = adminUserRepo.getTotpSecret(testUser.id);
      expect(secretAfter).toBe(secretBefore);
    });
  });

  describe('Encryption Utility', () => {
    it('should encrypt and decrypt values correctly', () => {
      const originalValue = 'secret-totp-key-12345';
      const encrypted = encrypt(originalValue, TEST_ENCRYPTION_KEY);

      // Encrypted value should be different from original
      expect(encrypted).not.toBe(originalValue);
      // Encrypted value should be base64 encoded
      expect(() => Buffer.from(encrypted, 'base64')).not.toThrow();

      const decrypted = decrypt(encrypted, TEST_ENCRYPTION_KEY);
      expect(decrypted).toBe(originalValue);
    });

    it('should produce different ciphertexts for same plaintext', () => {
      const originalValue = 'same-secret';
      const encrypted1 = encrypt(originalValue, TEST_ENCRYPTION_KEY);
      const encrypted2 = encrypt(originalValue, TEST_ENCRYPTION_KEY);

      // Different IVs should produce different ciphertexts
      expect(encrypted1).not.toBe(encrypted2);

      // Both should decrypt to original
      expect(decrypt(encrypted1, TEST_ENCRYPTION_KEY)).toBe(originalValue);
      expect(decrypt(encrypted2, TEST_ENCRYPTION_KEY)).toBe(originalValue);
    });
  });
});
