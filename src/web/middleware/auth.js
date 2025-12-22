/**
 * Authentication Middleware
 *
 * Provides middleware functions for protecting routes and setting authentication
 * context in templates.
 */

/**
 * Require Authentication Middleware
 *
 * Protects routes by checking for an authenticated session. Redirects
 * unauthenticated requests to the login page.
 *
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next function
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.adminUser) {
    // User is authenticated, proceed to the route
    return next();
  }

  // User is not authenticated, redirect to login
  res.redirect('/auth/login');
}

/**
 * Set Template Locals Middleware
 *
 * Sets authentication-related local variables that are available in all
 * EJS templates. This allows templates to conditionally render content
 * based on authentication state.
 *
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next function
 */
function setLocals(req, res, next) {
  // Set authentication status
  res.locals.isAuthenticated = !!(req.session && req.session.adminUser);

  // Set admin user info if authenticated
  res.locals.adminUser = req.session && req.session.adminUser ? req.session.adminUser : null;

  next();
}

module.exports = {
  requireAuth,
  setLocals
};
