# Security Remediation Plan - Saloon Bot

**Document Version:** 1.0
**Created:** December 2024
**Status:** Ready for Implementation

---

## Overview

This document outlines the remediation plan for security findings identified in the Saloon Bot security review. The plan is organized into three phases based on severity and implementation complexity.

---

## Phase 1: Critical & High Priority (Immediate)

These issues represent significant security risks and should be addressed first.

### 1.1 Implement Admin Authentication (SEC-001)

**Objective:** Restrict admin interface access to authenticated users only.

**Approach:**
1. Create authentication middleware
2. Implement login/logout routes
3. Add session-based user management
4. Protect all admin routes

**Files to Create/Modify:**
- `src/web/middleware/auth.js` (new)
- `src/web/routes/login.js` (new)
- `src/web/views/login.ejs` (new)
- `src/web/index.js`
- `src/database/repositories/admin-user-repo.js` (new)
- `src/database/schema.js` (add admin_users table)
- `migrations/007_admin_users.sql` (new)

**Implementation Notes:**
- Use bcrypt for password hashing
- Store hashed passwords only
- Consider adding optional 2FA in future
- Include account lockout after failed attempts

---

### 1.2 Encrypt OAuth Tokens at Rest (SEC-002)

**Objective:** Protect OAuth tokens from database compromise.

**Approach:**
1. Create encryption utility module
2. Modify auth repository to encrypt/decrypt tokens
3. Add migration to re-encrypt existing tokens
4. Require encryption key environment variable

**Files to Create/Modify:**
- `src/utils/crypto.js` (new)
- `src/database/repositories/auth-repo.js`
- `src/config/index.js`
- `.env.example`

**Implementation Notes:**
- Use AES-256-GCM for encryption
- Generate unique IV per encryption operation
- Store IV alongside encrypted data
- Add `TOKEN_ENCRYPTION_KEY` to required env vars

---

### 1.3 Add CSRF Protection (SEC-003)

**Objective:** Prevent cross-site request forgery attacks.

**Approach:**
1. Install csurf package
2. Configure CSRF middleware
3. Update all form templates to include CSRF token
4. Handle CSRF errors gracefully

**Files to Create/Modify:**
- `src/web/index.js`
- `src/web/views/**/*.ejs` (all forms)
- `package.json`

**Implementation Notes:**
- Use cookie-based CSRF tokens
- Add hidden input field to all POST forms
- Consider AJAX CSRF header pattern for future API endpoints

---

### 1.4 Add Security Headers (SEC-004)

**Objective:** Implement defense-in-depth via HTTP security headers.

**Approach:**
1. Install helmet package
2. Configure appropriate CSP policy
3. Enable all recommended headers

**Files to Create/Modify:**
- `src/web/index.js`
- `package.json`

**Configuration:**
```javascript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true
  }
}));
```

---

### 1.5 Require Session Secret (SEC-005)

**Objective:** Prevent deployment with insecure default secret.

**Approach:**
1. Remove default session secret value
2. Add validation to fail startup without SESSION_SECRET
3. Update documentation

**Files to Create/Modify:**
- `src/config/index.js`
- `README.md`
- `.env.example`

---

### 1.6 Implement Rate Limiting (SEC-006)

**Objective:** Protect against brute force and DoS attacks.

**Approach:**
1. Install express-rate-limit package
2. Configure global rate limiting
3. Add stricter limits for sensitive routes (auth, OAuth)

**Files to Create/Modify:**
- `src/web/index.js`
- `src/web/routes/auth.js`
- `package.json`

**Configuration:**
```javascript
// Global limiter
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later'
});

// Strict limiter for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many authentication attempts'
});
```

---

## Phase 2: Medium Priority (Short-term)

These issues should be addressed after Phase 1 is complete.

### 2.1 XSS Prevention Audit (SEC-007)

**Objective:** Ensure all user input is properly escaped in templates.

**Approach:**
1. Audit all EJS templates for `<%- %>` usage
2. Replace with `<%= %>` where appropriate
3. Document intentional unescaped output
4. Add template linting rules

**Files to Review/Modify:**
- All files in `src/web/views/**/*.ejs`

---

### 2.2 Secure Session Cookies (SEC-008)

**Objective:** Harden session cookie configuration.

**Approach:**
1. Add sameSite attribute
2. Review and document cookie settings

**Files to Modify:**
- `src/web/index.js`

**Configuration:**
```javascript
cookie: {
  secure: config.isProduction,
  httpOnly: true,
  sameSite: 'strict',
  maxAge: 24 * 60 * 60 * 1000
}
```

---

### 2.3 Production Error Handling (SEC-009)

**Objective:** Ensure error information is never leaked in production.

**Approach:**
1. Verify NODE_ENV handling
2. Add deployment documentation
3. Consider custom error IDs for tracking

**Files to Modify:**
- `src/web/index.js`
- `README.md`

---

### 2.4 Harden Docker Configuration (SEC-010)

**Objective:** Improve container security posture.

**Approach:**
1. Add non-root user to Dockerfile
2. Configure security options in compose files
3. Implement read-only filesystem where possible

**Files to Modify:**
- `docker/Dockerfile`
- `docker/docker-compose.yml`
- `docker/docker-compose.dev.yml`

---

### 2.5 Standardize External API Handling (SEC-011)

**Objective:** Consistent timeout and error handling for external APIs.

**Approach:**
1. Create API client wrapper utility
2. Implement consistent timeout handling
3. Sanitize error messages

**Files to Create/Modify:**
- `src/utils/api-client.js` (new)
- `src/services/advice-api.js`
- `src/services/dadjoke-api.js`
- `src/services/dictionary-api.js`
- `src/services/randomfact-api.js`
- `src/services/trivia-api.js`

---

## Phase 3: Low Priority (Ongoing)

These improvements can be implemented as part of regular development.

### 3.1 Request Body Limits (SEC-012)

**Objective:** Prevent large payload DoS attacks.

**Files to Modify:**
- `src/web/index.js`

---

### 3.2 Log Sanitization (SEC-013)

**Objective:** Prevent accidental logging of sensitive data.

**Files to Create/Modify:**
- `src/utils/logger.js`

---

### 3.3 SSL Documentation (SEC-014)

**Objective:** Clarify SSL/TLS requirements for production.

**Files to Modify:**
- `README.md`
- `scripts/generate-certs.sh`

---

## Dependencies to Add

```json
{
  "dependencies": {
    "bcrypt": "^5.1.1",
    "csurf": "^1.11.0",
    "helmet": "^7.1.0",
    "express-rate-limit": "^7.1.5"
  }
}
```

---

## Testing Requirements

### Phase 1 Testing
- [ ] Authentication flow (login/logout)
- [ ] Protected route access (unauthenticated redirect)
- [ ] CSRF token validation on all forms
- [ ] Rate limiting triggers correctly
- [ ] Token encryption/decryption roundtrip
- [ ] Application starts without default secrets

### Phase 2 Testing
- [ ] XSS payload injection attempts blocked
- [ ] Session cookies have correct attributes
- [ ] Error pages don't leak sensitive info
- [ ] Docker container runs as non-root
- [ ] External API timeouts work correctly

### Phase 3 Testing
- [ ] Large payload requests are rejected
- [ ] Logs don't contain sensitive data
- [ ] SSL warnings display appropriately

---

## Rollback Considerations

Each phase should be implemented with the ability to rollback:

1. **Database migrations** should have down migrations
2. **Token encryption** requires a migration script that can decrypt if needed
3. **Authentication** should have an emergency bypass for lockout scenarios
4. **Rate limiting** should be configurable/disableable via env var

---

## Success Criteria

- All Critical and High findings resolved
- No new security vulnerabilities introduced
- All tests passing
- Documentation updated
- Security headers verified via securityheaders.com
- Penetration test validation (recommended)

---

## Maintenance

After implementation:
1. Schedule quarterly security reviews
2. Monitor dependency vulnerabilities via `npm audit`
3. Review and rotate encryption keys annually
4. Update rate limits based on usage patterns
