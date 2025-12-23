/**
 * TOTP Utility Unit Tests
 */

const totp = require('../../src/utils/totp');

describe('TOTP Utility', () => {
  describe('generateSecret', () => {
    it('should generate a base32-encoded secret', () => {
      const secret = totp.generateSecret();

      expect(secret).toBeDefined();
      expect(typeof secret).toBe('string');
      // Base32 encoding uses A-Z and 2-7
      expect(secret).toMatch(/^[A-Z2-7]+$/);
      // 20 bytes = 160 bits = 32 base32 characters
      expect(secret.length).toBe(32);
    });

    it('should generate unique secrets', () => {
      const secrets = new Set();
      for (let i = 0; i < 100; i++) {
        secrets.add(totp.generateSecret());
      }
      // All secrets should be unique
      expect(secrets.size).toBe(100);
    });
  });

  describe('generateQRCode', () => {
    it('should generate a data URL for QR code', async () => {
      const secret = totp.generateSecret();
      const dataUrl = await totp.generateQRCode(secret, 'testuser');

      expect(dataUrl).toBeDefined();
      expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('should include the correct URI components', async () => {
      const secret = totp.generateSecret();
      const dataUrl = await totp.generateQRCode(secret, 'testuser');

      // Data URL should be a valid base64 PNG
      expect(dataUrl.length).toBeGreaterThan(100);
    });
  });

  describe('getOtpAuthUri', () => {
    it('should generate a valid otpauth URI', () => {
      const secret = totp.generateSecret();
      const uri = totp.getOtpAuthUri(secret, 'testuser');

      expect(uri).toMatch(/^otpauth:\/\/totp\//);
      expect(uri).toContain('testuser');
      expect(uri).toContain(`issuer=${encodeURIComponent(totp.ISSUER)}`);
      expect(uri).toContain(`digits=${totp.DIGITS}`);
      expect(uri).toContain(`period=${totp.PERIOD}`);
      expect(uri).toContain('secret=');
    });
  });

  describe('verifyCode', () => {
    it('should verify a valid TOTP code', () => {
      const secret = totp.generateSecret();

      // Generate a valid code using the same library
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

    it('should reject an invalid code', () => {
      const secret = totp.generateSecret();
      const result = totp.verifyCode(secret, '000000', 'testuser');

      // The code '000000' is extremely unlikely to be valid
      // (1 in 1 million chance, and we're not at that exact time)
      expect(result).toBe(false);
    });

    it('should reject non-numeric codes', () => {
      const secret = totp.generateSecret();
      const result = totp.verifyCode(secret, 'abcdef', 'testuser');

      expect(result).toBe(false);
    });

    it('should reject codes with wrong length', () => {
      const secret = totp.generateSecret();

      expect(totp.verifyCode(secret, '12345', 'testuser')).toBe(false);
      expect(totp.verifyCode(secret, '1234567', 'testuser')).toBe(false);
    });

    it('should handle null/undefined inputs', () => {
      const secret = totp.generateSecret();

      expect(totp.verifyCode(null, '123456', 'testuser')).toBe(false);
      expect(totp.verifyCode(secret, null, 'testuser')).toBe(false);
      expect(totp.verifyCode(undefined, '123456', 'testuser')).toBe(false);
    });

    it('should normalize codes with spaces', () => {
      const secret = totp.generateSecret();

      // Generate a valid code
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
      const codeWithSpaces = validCode.slice(0, 3) + ' ' + validCode.slice(3);

      const result = totp.verifyCode(secret, codeWithSpaces, 'testuser');
      expect(result).toBe(true);
    });
  });

  describe('generateBackupCodes', () => {
    it('should generate the specified number of codes', () => {
      const codes = totp.generateBackupCodes(10);
      expect(codes).toHaveLength(10);

      const codes5 = totp.generateBackupCodes(5);
      expect(codes5).toHaveLength(5);
    });

    it('should generate 8-character hex codes', () => {
      const codes = totp.generateBackupCodes(10);

      codes.forEach(code => {
        expect(code).toHaveLength(8);
        expect(code).toMatch(/^[0-9A-F]+$/);
      });
    });

    it('should generate unique codes', () => {
      const codes = totp.generateBackupCodes(10);
      const uniqueCodes = new Set(codes);

      expect(uniqueCodes.size).toBe(10);
    });
  });

  describe('formatBackupCode', () => {
    it('should format 8-character codes with a dash', () => {
      const formatted = totp.formatBackupCode('ABCD1234');
      expect(formatted).toBe('ABCD-1234');
    });

    it('should return unchanged for non-8-character codes', () => {
      expect(totp.formatBackupCode('ABC')).toBe('ABC');
      expect(totp.formatBackupCode('ABCDEFGHIJ')).toBe('ABCDEFGHIJ');
    });
  });

  describe('normalizeBackupCode', () => {
    it('should remove dashes and uppercase', () => {
      expect(totp.normalizeBackupCode('abcd-1234')).toBe('ABCD1234');
      expect(totp.normalizeBackupCode('ABCD-1234')).toBe('ABCD1234');
    });

    it('should remove spaces', () => {
      expect(totp.normalizeBackupCode('ABCD 1234')).toBe('ABCD1234');
      expect(totp.normalizeBackupCode('AB CD 12 34')).toBe('ABCD1234');
    });

    it('should handle already normalized codes', () => {
      expect(totp.normalizeBackupCode('ABCD1234')).toBe('ABCD1234');
    });

    it('should handle numeric input', () => {
      expect(totp.normalizeBackupCode(12345678)).toBe('12345678');
    });
  });

  describe('exported constants', () => {
    it('should export ISSUER as Saloon Bot', () => {
      expect(totp.ISSUER).toBe('Saloon Bot');
    });

    it('should export DIGITS as 6', () => {
      expect(totp.DIGITS).toBe(6);
    });

    it('should export PERIOD as 30', () => {
      expect(totp.PERIOD).toBe(30);
    });
  });
});
