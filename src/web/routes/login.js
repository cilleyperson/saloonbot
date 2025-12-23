const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const adminUserRepo = require('../../database/repositories/admin-user-repo');
const totp = require('../../utils/totp');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('login-routes');

// Constants for account lockout
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes in milliseconds

// 2FA pending session timeout (5 minutes)
const TOTP_PENDING_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * GET /login - Render login form
 * Skip if user is already authenticated
 */
router.get('/login', (req, res) => {
  // If already authenticated, redirect to dashboard
  if (req.session && req.session.adminUser) {
    logger.debug('User already authenticated, redirecting to dashboard', {
      userId: req.session.adminUser.id
    });
    return res.redirect('/');
  }

  // Render login page with flash messages
  // Note: csrfToken is already set in res.locals by the CSRF middleware
  res.render('login', {
    flash: {
      error: req.session?.flash?.error || null
    }
  });

  // Clear flash messages after rendering
  if (req.session?.flash) {
    delete req.session.flash;
  }
});

/**
 * POST /login - Handle login submission
 * Validates credentials, checks lockout, sets session
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    // Validate input
    if (!username || !password) {
      logger.warn('Login attempt with missing credentials');
      req.session.flash = { error: 'Username and password are required' };
      return res.redirect('/auth/login');
    }

    // Find user by username
    const user = adminUserRepo.findByUsername(username);

    if (!user) {
      logger.warn('Login attempt for non-existent user', { username });
      req.session.flash = { error: 'Invalid username or password' };
      return res.redirect('/auth/login');
    }

    // Check if account is locked
    if (adminUserRepo.isLocked(user)) {
      const lockTime = new Date(user.locked_until);
      const remainingMinutes = Math.ceil((lockTime - new Date()) / 60000);

      logger.warn('Login attempt for locked account', {
        userId: user.id,
        username: user.username,
        lockedUntil: user.locked_until
      });

      req.session.flash = {
        error: `Account is locked due to too many failed login attempts. Try again in ${remainingMinutes} minute(s).`
      };
      return res.redirect('/auth/login');
    }

    // Verify password using bcrypt
    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      // Increment failed attempts
      adminUserRepo.incrementFailedAttempts(user.id);

      // Get updated user to check failed attempts count
      const updatedUser = adminUserRepo.findById(user.id);
      const failedAttempts = updatedUser.failed_attempts;

      logger.warn('Failed login attempt', {
        userId: user.id,
        username: user.username,
        failedAttempts
      });

      // Lock account if max attempts reached
      if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
        const lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        adminUserRepo.lockUser(user.id, lockUntil);

        logger.warn('Account locked due to failed login attempts', {
          userId: user.id,
          username: user.username,
          lockedUntil: lockUntil.toISOString(),
          failedAttempts
        });

        req.session.flash = {
          error: 'Account locked due to too many failed login attempts. Try again in 15 minutes.'
        };
      } else {
        const attemptsRemaining = MAX_FAILED_ATTEMPTS - failedAttempts;
        req.session.flash = {
          error: `Invalid username or password. ${attemptsRemaining} attempt(s) remaining before account lockout.`
        };
      }

      return res.redirect('/auth/login');
    }

    // Password verified successfully
    logger.info('Password verified', {
      userId: user.id,
      username: user.username
    });

    // Reset failed attempts on successful password verification
    adminUserRepo.resetFailedAttempts(user.id);

    // Check if user has 2FA enabled
    if (adminUserRepo.hasTotpEnabled(user)) {
      logger.info('2FA required for login', {
        userId: user.id,
        username: user.username
      });

      // Store pending 2FA state in session
      req.session.pendingTwoFactor = {
        userId: user.id,
        username: user.username,
        timestamp: Date.now()
      };

      return res.redirect('/auth/2fa');
    }

    // No 2FA - complete login
    completeLogin(req, res, user);

  } catch (error) {
    logger.error('Login error', {
      username,
      error: error.message,
      stack: error.stack
    });

    req.session.flash = { error: 'An error occurred during login. Please try again.' };
    res.redirect('/auth/login');
  }
});

/**
 * Helper function to complete the login process
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Object} user - User object
 */
function completeLogin(req, res, user) {
  logger.info('Successful login', {
    userId: user.id,
    username: user.username
  });

  // Update last login timestamp
  adminUserRepo.updateLastLogin(user.id);

  // Clear any pending 2FA state
  delete req.session.pendingTwoFactor;

  // Set session with adminUser object (expected by auth middleware)
  req.session.adminUser = {
    id: user.id,
    username: user.username
  };

  // Regenerate session ID for security
  req.session.regenerate((err) => {
    if (err) {
      logger.error('Failed to regenerate session after login', {
        userId: user.id,
        error: err.message
      });
      // Continue anyway - session is still valid
    }

    // Restore session data after regeneration
    req.session.adminUser = {
      id: user.id,
      username: user.username
    };

    res.redirect('/');
  });
}

/**
 * GET /2fa - Render 2FA challenge form
 */
router.get('/2fa', (req, res) => {
  const pending = req.session?.pendingTwoFactor;

  // Check for pending 2FA session
  if (!pending) {
    logger.warn('2FA page accessed without pending session');
    return res.redirect('/auth/login');
  }

  // Check if pending session has expired
  if (Date.now() - pending.timestamp > TOTP_PENDING_TIMEOUT_MS) {
    logger.warn('2FA pending session expired', { userId: pending.userId });
    delete req.session.pendingTwoFactor;
    req.session.flash = { error: 'Session expired. Please log in again.' };
    return res.redirect('/auth/login');
  }

  // Note: csrfToken is already set in res.locals by the CSRF middleware
  res.render('2fa-challenge', {
    username: pending.username,
    flash: {
      error: req.session?.flash?.error || null
    }
  });

  // Clear flash messages after rendering
  if (req.session?.flash) {
    delete req.session.flash;
  }
});

/**
 * POST /2fa - Verify 2FA code
 */
router.post('/2fa', async (req, res) => {
  const { code, useBackupCode } = req.body;
  const pending = req.session?.pendingTwoFactor;

  // Check for pending 2FA session
  if (!pending) {
    logger.warn('2FA verification attempted without pending session');
    return res.redirect('/auth/login');
  }

  // Check if pending session has expired
  if (Date.now() - pending.timestamp > TOTP_PENDING_TIMEOUT_MS) {
    logger.warn('2FA pending session expired during verification', { userId: pending.userId });
    delete req.session.pendingTwoFactor;
    req.session.flash = { error: 'Session expired. Please log in again.' };
    return res.redirect('/auth/login');
  }

  // Get user
  const user = adminUserRepo.findById(pending.userId);
  if (!user) {
    logger.error('User not found during 2FA verification', { userId: pending.userId });
    delete req.session.pendingTwoFactor;
    req.session.flash = { error: 'An error occurred. Please log in again.' };
    return res.redirect('/auth/login');
  }

  // Validate code input
  if (!code) {
    req.session.flash = { error: 'Please enter an authentication code' };
    return res.redirect('/auth/2fa');
  }

  let isValid = false;

  if (useBackupCode) {
    // Verify backup code
    isValid = await verifyBackupCode(user, code);
    if (isValid) {
      logger.info('2FA verified using backup code', {
        userId: user.id,
        username: user.username
      });
    }
  } else {
    // Verify TOTP code
    const secret = adminUserRepo.getTotpSecret(user.id);
    if (secret) {
      isValid = totp.verifyCode(secret, code, user.username);
    }
    if (isValid) {
      logger.info('2FA verified using TOTP', {
        userId: user.id,
        username: user.username
      });
    }
  }

  if (!isValid) {
    logger.warn('Invalid 2FA code', {
      userId: user.id,
      username: user.username,
      useBackupCode: !!useBackupCode
    });
    req.session.flash = { error: 'Invalid authentication code. Please try again.' };
    return res.redirect('/auth/2fa');
  }

  // 2FA verified - complete login
  completeLogin(req, res, user);
});

/**
 * Verify a backup code and remove it if valid
 * @param {Object} user - User object
 * @param {string} code - Backup code to verify
 * @returns {Promise<boolean>} True if valid
 */
async function verifyBackupCode(user, code) {
  const hashedCodes = adminUserRepo.getBackupCodes(user.id);

  if (!hashedCodes || hashedCodes.length === 0) {
    return false;
  }

  const normalizedCode = totp.normalizeBackupCode(code);

  // Check each hashed code
  for (let i = 0; i < hashedCodes.length; i++) {
    const match = await bcrypt.compare(normalizedCode, hashedCodes[i]);
    if (match) {
      // Remove the used code
      const remainingCodes = hashedCodes.filter((_, index) => index !== i);
      adminUserRepo.updateBackupCodes(user.id, remainingCodes);

      logger.info('Backup code used', {
        userId: user.id,
        remainingCodes: remainingCodes.length
      });

      return true;
    }
  }

  return false;
}

/**
 * POST /logout - Clear session and redirect to login
 */
router.post('/logout', (req, res) => {
  const adminUser = req.session?.adminUser;

  if (adminUser) {
    logger.info('User logged out', {
      userId: adminUser.id,
      username: adminUser.username
    });
  }

  // Destroy session completely
  req.session.destroy((err) => {
    if (err) {
      logger.error('Failed to destroy session during logout', {
        userId: adminUser?.id,
        error: err.message
      });
    }

    // Clear session cookie
    res.clearCookie('connect.sid');

    // Redirect to login page
    res.redirect('/auth/login');
  });
});

module.exports = router;
