const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const adminUserRepo = require('../../database/repositories/admin-user-repo');
const { createChildLogger } = require('../../utils/logger');

const logger = createChildLogger('login-routes');

// Constants for account lockout
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes in milliseconds

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
  res.render('login', {
    csrfToken: req.csrfToken ? req.csrfToken() : '',
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

    // Successful login
    logger.info('Successful login', {
      userId: user.id,
      username: user.username
    });

    // Reset failed attempts on successful login
    adminUserRepo.resetFailedAttempts(user.id);

    // Update last login timestamp
    adminUserRepo.updateLastLogin(user.id);

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
