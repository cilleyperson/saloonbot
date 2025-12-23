/**
 * Two-Factor Authentication Routes
 *
 * Handles 2FA setup, verification, and management for admin users.
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const adminUserRepo = require('../../database/repositories/admin-user-repo');
const totp = require('../../utils/totp');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('two-factor-routes');

// Bcrypt cost factor for hashing backup codes
const BCRYPT_ROUNDS = 10;

/**
 * GET /account/security
 * Show 2FA settings page
 */
router.get('/security', (req, res) => {
  const user = adminUserRepo.findById(req.session.adminUser.id);

  if (!user) {
    req.flash('error', 'User not found');
    return res.redirect('/');
  }

  res.render('account/security', {
    title: 'Security Settings',
    totpEnabled: adminUserRepo.hasTotpEnabled(user),
    totpVerifiedAt: user.totp_verified_at
  });
});

/**
 * GET /account/2fa/setup
 * Start 2FA setup - generate secret and show QR code
 */
router.get('/2fa/setup', async (req, res) => {
  const user = adminUserRepo.findById(req.session.adminUser.id);

  if (!user) {
    req.flash('error', 'User not found');
    return res.redirect('/account/security');
  }

  // Check if 2FA is already enabled
  if (adminUserRepo.hasTotpEnabled(user)) {
    req.flash('error', '2FA is already enabled');
    return res.redirect('/account/security');
  }

  try {
    // Generate new secret
    const secret = totp.generateSecret();

    // Store the secret (not yet verified)
    adminUserRepo.storeTotpSecret(user.id, secret);

    // Generate QR code
    const qrCodeDataUrl = await totp.generateQRCode(secret, user.username);
    const otpAuthUri = totp.getOtpAuthUri(secret, user.username);

    logger.info(`2FA setup initiated for user ${user.username}`);

    res.render('account/2fa-setup', {
      title: 'Set Up Two-Factor Authentication',
      qrCodeDataUrl,
      secret, // For manual entry
      otpAuthUri,
      issuer: totp.ISSUER
    });
  } catch (error) {
    logger.error('Failed to initiate 2FA setup', { error: error.message, userId: user.id });
    req.flash('error', 'Failed to start 2FA setup. Please try again.');
    res.redirect('/account/security');
  }
});

/**
 * POST /account/2fa/verify
 * Verify TOTP code and enable 2FA
 */
router.post('/2fa/verify', async (req, res) => {
  const { code } = req.body;
  const user = adminUserRepo.findById(req.session.adminUser.id);

  if (!user) {
    req.flash('error', 'User not found');
    return res.redirect('/account/security');
  }

  // Check if already enabled
  if (adminUserRepo.hasTotpEnabled(user)) {
    req.flash('error', '2FA is already enabled');
    return res.redirect('/account/security');
  }

  // Get the pending secret
  const secret = adminUserRepo.getTotpSecret(user.id);

  if (!secret) {
    req.flash('error', 'Please start 2FA setup first');
    return res.redirect('/account/2fa/setup');
  }

  // Verify the code
  if (!totp.verifyCode(secret, code, user.username)) {
    logger.warn(`Invalid 2FA verification code for user ${user.username}`);
    req.flash('error', 'Invalid verification code. Please try again.');
    return res.redirect('/account/2fa/setup');
  }

  try {
    // Generate backup codes
    const backupCodes = totp.generateBackupCodes(10);

    // Hash backup codes before storing
    const hashedCodes = await Promise.all(
      backupCodes.map(code => bcrypt.hash(code, BCRYPT_ROUNDS))
    );

    // Store hashed backup codes
    adminUserRepo.storeBackupCodes(user.id, hashedCodes);

    // Enable 2FA
    adminUserRepo.enableTotp(user.id);

    logger.info(`2FA enabled for user ${user.username}`);

    // Show backup codes (one time only)
    res.render('account/2fa-backup-codes', {
      title: 'Two-Factor Authentication Enabled',
      backupCodes: backupCodes.map(totp.formatBackupCode),
      justEnabled: true
    });
  } catch (error) {
    logger.error('Failed to enable 2FA', { error: error.message, userId: user.id });
    req.flash('error', 'Failed to enable 2FA. Please try again.');
    res.redirect('/account/2fa/setup');
  }
});

/**
 * POST /account/2fa/disable
 * Disable 2FA (requires password confirmation)
 */
router.post('/2fa/disable', async (req, res) => {
  const { password, code } = req.body;
  const user = adminUserRepo.findById(req.session.adminUser.id);

  if (!user) {
    req.flash('error', 'User not found');
    return res.redirect('/account/security');
  }

  // Check if 2FA is enabled
  if (!adminUserRepo.hasTotpEnabled(user)) {
    req.flash('error', '2FA is not enabled');
    return res.redirect('/account/security');
  }

  // Verify password
  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    logger.warn(`Invalid password for 2FA disable attempt by user ${user.username}`);
    req.flash('error', 'Invalid password');
    return res.redirect('/account/security');
  }

  // Verify TOTP code
  const secret = adminUserRepo.getTotpSecret(user.id);
  if (!totp.verifyCode(secret, code, user.username)) {
    logger.warn(`Invalid TOTP code for 2FA disable attempt by user ${user.username}`);
    req.flash('error', 'Invalid authentication code');
    return res.redirect('/account/security');
  }

  // Disable 2FA
  adminUserRepo.disableTotp(user.id);
  logger.info(`2FA disabled for user ${user.username}`);

  req.flash('success', 'Two-factor authentication has been disabled');
  res.redirect('/account/security');
});

/**
 * GET /account/2fa/backup-codes
 * View remaining backup codes (requires 2FA code)
 */
router.get('/2fa/backup-codes', (req, res) => {
  const user = adminUserRepo.findById(req.session.adminUser.id);

  if (!user || !adminUserRepo.hasTotpEnabled(user)) {
    req.flash('error', '2FA must be enabled to view backup codes');
    return res.redirect('/account/security');
  }

  // Show form to verify identity before showing backup codes info
  res.render('account/2fa-verify-action', {
    title: 'View Backup Codes',
    action: '/account/2fa/backup-codes',
    actionName: 'View Backup Codes',
    requirePassword: true
  });
});

/**
 * POST /account/2fa/backup-codes
 * Generate new backup codes
 */
router.post('/2fa/backup-codes', async (req, res) => {
  const { password, code } = req.body;
  const user = adminUserRepo.findById(req.session.adminUser.id);

  if (!user || !adminUserRepo.hasTotpEnabled(user)) {
    req.flash('error', '2FA must be enabled');
    return res.redirect('/account/security');
  }

  // Verify password
  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    req.flash('error', 'Invalid password');
    return res.redirect('/account/2fa/backup-codes');
  }

  // Verify TOTP code
  const secret = adminUserRepo.getTotpSecret(user.id);
  if (!totp.verifyCode(secret, code, user.username)) {
    req.flash('error', 'Invalid authentication code');
    return res.redirect('/account/2fa/backup-codes');
  }

  try {
    // Generate new backup codes
    const backupCodes = totp.generateBackupCodes(10);

    // Hash backup codes
    const hashedCodes = await Promise.all(
      backupCodes.map(code => bcrypt.hash(code, BCRYPT_ROUNDS))
    );

    // Store new hashed backup codes (replaces old ones)
    adminUserRepo.storeBackupCodes(user.id, hashedCodes);

    logger.info(`New backup codes generated for user ${user.username}`);

    res.render('account/2fa-backup-codes', {
      title: 'New Backup Codes',
      backupCodes: backupCodes.map(totp.formatBackupCode),
      justEnabled: false
    });
  } catch (error) {
    logger.error('Failed to generate backup codes', { error: error.message, userId: user.id });
    req.flash('error', 'Failed to generate backup codes');
    res.redirect('/account/security');
  }
});

/**
 * GET /account/2fa/cancel
 * Cancel pending 2FA setup
 */
router.get('/2fa/cancel', (req, res) => {
  const user = adminUserRepo.findById(req.session.adminUser.id);

  if (user) {
    adminUserRepo.clearPendingTotp(user.id);
    logger.info(`2FA setup cancelled for user ${user.username}`);
  }

  req.flash('info', '2FA setup cancelled');
  res.redirect('/account/security');
});

module.exports = router;
