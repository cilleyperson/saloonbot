# Security Remediation Tasks - Claude Code Orchestration

This document contains granular, actionable tasks for security remediation. Each task is designed to be executed independently by Claude Code agents when possible.

---

## Task Execution Guide

### For Claude Code Users

Execute tasks using the Task tool with appropriate agent types:
- **Code changes:** Use `frontend-mobile-development:frontend-developer` or `general-purpose`
- **Security review:** Use `security-compliance:security-auditor`
- **Documentation:** Use `documentation-generation:docs-architect`

### Task Format

Each task includes:
- **ID:** Unique identifier (SEC-XXX-N)
- **Finding:** Related security finding
- **Depends On:** Prerequisites
- **Agent Type:** Recommended Claude Code agent
- **Acceptance Criteria:** How to verify completion

---

## Phase 1: Critical & High Priority Tasks

### SEC-001: Admin Authentication

#### SEC-001-1: Create Admin Users Database Migration

**Finding:** SEC-001
**Depends On:** None
**Agent Type:** `general-purpose`

**Task:**
Create a new database migration file `migrations/007_admin_users.sql` that creates an `admin_users` table with the following schema:
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `username` TEXT UNIQUE NOT NULL
- `password_hash` TEXT NOT NULL
- `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
- `last_login` DATETIME
- `is_active` INTEGER DEFAULT 1
- `failed_attempts` INTEGER DEFAULT 0
- `locked_until` DATETIME

**Acceptance Criteria:**
- [ ] Migration file exists at `migrations/007_admin_users.sql`
- [ ] Schema includes all specified columns
- [ ] Migration is applied in `src/database/schema.js`

---

#### SEC-001-2: Create Admin User Repository

**Finding:** SEC-001
**Depends On:** SEC-001-1
**Agent Type:** `general-purpose`

**Task:**
Create `src/database/repositories/admin-user-repo.js` with functions:
- `create(username, passwordHash)` - Create new admin user
- `findByUsername(username)` - Find user by username
- `findById(id)` - Find user by ID
- `updateLastLogin(id)` - Update last login timestamp
- `incrementFailedAttempts(id)` - Increment failed login counter
- `resetFailedAttempts(id)` - Reset failed attempts to 0
- `lockUser(id, until)` - Set locked_until timestamp
- `isLocked(user)` - Check if user is currently locked

Use parameterized queries (prepared statements) for all database operations.

**Acceptance Criteria:**
- [ ] File exists at `src/database/repositories/admin-user-repo.js`
- [ ] All functions implemented with parameterized queries
- [ ] Proper error handling included

---

#### SEC-001-3: Create Authentication Middleware

**Finding:** SEC-001
**Depends On:** SEC-001-2
**Agent Type:** `general-purpose`

**Task:**
Create `src/web/middleware/auth.js` with:

1. `requireAuth` middleware that:
   - Checks if `req.session.adminUser` exists
   - Redirects to `/login` if not authenticated
   - Calls `next()` if authenticated

2. `setLocals` middleware that:
   - Sets `res.locals.isAuthenticated` based on session
   - Sets `res.locals.adminUser` if logged in

Export both middleware functions.

**Acceptance Criteria:**
- [ ] File exists at `src/web/middleware/auth.js`
- [ ] `requireAuth` properly redirects unauthenticated users
- [ ] `setLocals` sets template locals correctly

---

#### SEC-001-4: Create Login Routes

**Finding:** SEC-001
**Depends On:** SEC-001-2, SEC-001-3
**Agent Type:** `general-purpose`

**Task:**
Create `src/web/routes/login.js` with routes:

1. `GET /login` - Render login form (skip if already authenticated)
2. `POST /login` - Handle login:
   - Validate username/password
   - Use bcrypt.compare for password verification
   - Check account lockout status
   - Set session on success
   - Increment failed attempts on failure
   - Lock account after 5 failed attempts for 15 minutes
3. `POST /logout` - Clear session and redirect to login

Use the logger for security events (failed logins, lockouts).

**Acceptance Criteria:**
- [ ] File exists at `src/web/routes/login.js`
- [ ] Login validates credentials securely
- [ ] Logout clears session properly
- [ ] Account lockout works correctly

---

#### SEC-001-5: Create Login View Template

**Finding:** SEC-001
**Depends On:** None
**Agent Type:** `frontend-mobile-development:frontend-developer`

**Task:**
Create `src/web/views/login.ejs` with:
- Login form with username and password fields
- CSRF token hidden field (placeholder `<%= csrfToken %>`)
- Flash message display for errors
- Consistent styling with existing templates
- No navigation bar (standalone page)

**Acceptance Criteria:**
- [ ] File exists at `src/web/views/login.ejs`
- [ ] Form posts to `/login`
- [ ] CSRF token placeholder included
- [ ] Styling matches existing templates

---

#### SEC-001-6: Integrate Authentication into Express App

**Finding:** SEC-001
**Depends On:** SEC-001-3, SEC-001-4, SEC-001-5
**Agent Type:** `general-purpose`

**Task:**
Modify `src/web/index.js` to:
1. Import auth middleware from `./middleware/auth`
2. Import login routes from `./routes/login`
3. Apply `setLocals` middleware globally (after session)
4. Mount login routes at `/` (before protected routes)
5. Apply `requireAuth` to all channel and admin routes

Routes that should be protected:
- `/channels/*`
- `/` (dashboard)

Routes that should NOT require auth:
- `/login`
- `/logout`
- `/auth/*` (OAuth callbacks)

**Acceptance Criteria:**
- [ ] Auth middleware integrated
- [ ] Protected routes require authentication
- [ ] OAuth callbacks remain accessible
- [ ] Login/logout routes work

---

#### SEC-001-7: Create Admin Setup Command

**Finding:** SEC-001
**Depends On:** SEC-001-2
**Agent Type:** `general-purpose`

**Task:**
Create `scripts/create-admin.js` that:
1. Prompts for username and password (or accepts as args)
2. Validates password strength (min 12 chars, mixed case, numbers)
3. Hashes password with bcrypt (cost factor 12)
4. Creates admin user in database
5. Outputs success message

Make it runnable via `node scripts/create-admin.js`.

**Acceptance Criteria:**
- [ ] Script exists at `scripts/create-admin.js`
- [ ] Password validation works
- [ ] Admin user created successfully
- [ ] Script is documented in README

---

### SEC-002: Token Encryption

#### SEC-002-1: Create Encryption Utility Module

**Finding:** SEC-002
**Depends On:** None
**Agent Type:** `security-compliance:security-auditor`

**Task:**
Create `src/utils/crypto.js` with:

1. `encrypt(plaintext, key)` function:
   - Use AES-256-GCM algorithm
   - Generate random 12-byte IV per encryption
   - Return object: `{ iv, encrypted, authTag }` as base64 strings
   - Or return single combined string format

2. `decrypt(encryptedData, key)` function:
   - Parse IV, encrypted data, and auth tag
   - Decrypt and return plaintext
   - Throw on authentication failure

3. `generateKey()` function (optional):
   - Generate a random 32-byte key as hex string

Use Node.js `crypto` module. Do not use external dependencies.

**Acceptance Criteria:**
- [ ] File exists at `src/utils/crypto.js`
- [ ] Encryption uses AES-256-GCM
- [ ] Unique IV generated per encryption
- [ ] Roundtrip encrypt/decrypt works correctly

---

#### SEC-002-2: Add Token Encryption Key to Config

**Finding:** SEC-002
**Depends On:** SEC-002-1
**Agent Type:** `general-purpose`

**Task:**
Modify `src/config/index.js` to:
1. Add `security.tokenEncryptionKey` from `TOKEN_ENCRYPTION_KEY` env var
2. Add validation that key is required in production
3. Key should be 64 hex characters (32 bytes)

Update `.env.example` with `TOKEN_ENCRYPTION_KEY` placeholder and comment.

**Acceptance Criteria:**
- [ ] Config includes `security.tokenEncryptionKey`
- [ ] Validation fails without key in production
- [ ] `.env.example` updated

---

#### SEC-002-3: Encrypt Tokens in Auth Repository

**Finding:** SEC-002
**Depends On:** SEC-002-1, SEC-002-2
**Agent Type:** `general-purpose`

**Task:**
Modify `src/database/repositories/auth-repo.js` to:
1. Import crypto utility
2. Encrypt `access_token` and `refresh_token` before storing
3. Decrypt tokens when reading from database
4. Handle both encrypted and unencrypted tokens (migration path)

Functions to modify:
- `saveBotAuth`
- `updateBotAuth`
- `getBotAuth`
- `saveChannelAuth`
- `updateChannelAuth`
- `getChannelAuth`
- `getAllChannelAuths`

**Acceptance Criteria:**
- [ ] Tokens encrypted before database write
- [ ] Tokens decrypted on read
- [ ] Backward compatibility with existing unencrypted tokens

---

#### SEC-002-4: Create Token Migration Script

**Finding:** SEC-002
**Depends On:** SEC-002-3
**Agent Type:** `general-purpose`

**Task:**
Create `scripts/migrate-tokens.js` that:
1. Reads all existing tokens from database
2. Identifies unencrypted tokens
3. Encrypts them with the new key
4. Updates database records
5. Reports migration status

Include a `--dry-run` flag to preview changes.

**Acceptance Criteria:**
- [ ] Script exists at `scripts/migrate-tokens.js`
- [ ] Identifies and migrates unencrypted tokens
- [ ] Dry run mode works
- [ ] Handles errors gracefully

---

### SEC-003: CSRF Protection

#### SEC-003-1: Install and Configure CSRF Middleware

**Finding:** SEC-003
**Depends On:** None
**Agent Type:** `general-purpose`

**Task:**
1. Add `csurf` to package.json dependencies
2. Modify `src/web/index.js` to:
   - Import csurf: `const csrf = require('csurf')`
   - Configure: `const csrfProtection = csrf({ cookie: true })`
   - Apply after cookie-parser/session: `app.use(csrfProtection)`
   - Add middleware to set `res.locals.csrfToken = req.csrfToken()`
   - Add CSRF error handler

**Acceptance Criteria:**
- [ ] csurf added to dependencies
- [ ] CSRF middleware configured
- [ ] csrfToken available in templates
- [ ] CSRF errors handled gracefully

---

#### SEC-003-2: Add CSRF Tokens to All Forms

**Finding:** SEC-003
**Depends On:** SEC-003-1
**Agent Type:** `general-purpose`

**Task:**
Add hidden CSRF token input to all POST forms in templates:
```html
<input type="hidden" name="_csrf" value="<%= csrfToken %>">
```

Files to modify:
- `src/web/views/channels/settings.ejs`
- `src/web/views/commands/form.ejs`
- `src/web/views/commands/responses.ejs`
- `src/web/views/counters/form.ejs`
- `src/web/views/chat-memberships/form.ejs`
- `src/web/views/predefined-commands/*.ejs`
- Any other templates with forms

**Acceptance Criteria:**
- [ ] All POST forms include CSRF token
- [ ] Forms submit successfully with valid token
- [ ] Invalid token requests are rejected

---

### SEC-004: Security Headers

#### SEC-004-1: Install and Configure Helmet

**Finding:** SEC-004
**Depends On:** None
**Agent Type:** `general-purpose`

**Task:**
1. Add `helmet` to package.json dependencies
2. Modify `src/web/index.js` to:
   - Import helmet: `const helmet = require('helmet')`
   - Configure and apply before routes:
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
         frameAncestors: ["'none'"],
         upgradeInsecureRequests: []
       }
     }
   }));
   ```

**Acceptance Criteria:**
- [ ] helmet added to dependencies
- [ ] Security headers present in responses
- [ ] CSP configured appropriately
- [ ] Application functions correctly with headers

---

### SEC-005: Session Secret Requirement

#### SEC-005-1: Make Session Secret Required

**Finding:** SEC-005
**Depends On:** None
**Agent Type:** `general-purpose`

**Task:**
Modify `src/config/index.js`:
1. Remove default value for sessionSecret
2. Add to validateConfig() function to check for sessionSecret
3. Application should fail to start without SESSION_SECRET in production

```javascript
sessionSecret: process.env.SESSION_SECRET,
// In validateConfig:
if (config.isProduction && !config.server.sessionSecret) {
  missing.push('SESSION_SECRET');
}
```

Update `.env.example` to clearly mark SESSION_SECRET as required.

**Acceptance Criteria:**
- [ ] Default value removed
- [ ] Validation added for production
- [ ] Clear error message on missing secret
- [ ] Documentation updated

---

### SEC-006: Rate Limiting

#### SEC-006-1: Implement Global Rate Limiting

**Finding:** SEC-006
**Depends On:** None
**Agent Type:** `general-purpose`

**Task:**
1. Add `express-rate-limit` to package.json dependencies
2. Modify `src/web/index.js` to:
   - Import rate limiter
   - Create global limiter (100 requests per 15 min)
   - Create auth limiter (10 requests per 15 min)
   - Apply global limiter to all routes
   - Apply auth limiter to `/auth/*` and `/login` routes

```javascript
const rateLimit = require('express-rate-limit');

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10
});

app.use(globalLimiter);
app.use('/auth', authLimiter);
app.use('/login', authLimiter);
```

**Acceptance Criteria:**
- [ ] express-rate-limit added to dependencies
- [ ] Global rate limiting active
- [ ] Stricter limits on auth routes
- [ ] Rate limit headers in responses

---

## Phase 2: Medium Priority Tasks

### SEC-007: XSS Prevention

#### SEC-007-1: Audit EJS Templates for XSS

**Finding:** SEC-007
**Depends On:** None
**Agent Type:** `security-compliance:security-auditor`

**Task:**
Review all `.ejs` files in `src/web/views/` and:
1. Identify all uses of `<%- %>` (unescaped output)
2. Determine if each is intentional and safe
3. Replace with `<%= %>` where user data could be present
4. Document any intentional unescaped output

The `<%- body %>` in layout.ejs is intentional for includes.
Flash messages should use escaped output.

**Acceptance Criteria:**
- [ ] All templates audited
- [ ] Unsafe unescaped output fixed
- [ ] Intentional uses documented

---

### SEC-008: Session Cookie Security

#### SEC-008-1: Add SameSite Cookie Attribute

**Finding:** SEC-008
**Depends On:** None
**Agent Type:** `general-purpose`

**Task:**
Modify session configuration in `src/web/index.js`:

```javascript
cookie: {
  secure: config.isProduction,
  httpOnly: true,
  sameSite: 'strict',
  maxAge: 24 * 60 * 60 * 1000
}
```

**Acceptance Criteria:**
- [ ] sameSite attribute added
- [ ] Sessions work correctly with strict mode

---

### SEC-010: Docker Hardening

#### SEC-010-1: Add Non-Root User to Dockerfile

**Finding:** SEC-010
**Depends On:** None
**Agent Type:** `general-purpose`

**Task:**
Modify `docker/Dockerfile` to:
1. Create non-root user and group
2. Set ownership of application files
3. Switch to non-root user before CMD

```dockerfile
# After COPY commands
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser
```

**Acceptance Criteria:**
- [ ] Container runs as non-root user
- [ ] Application functions correctly
- [ ] File permissions are correct

---

#### SEC-010-2: Add Security Options to Docker Compose

**Finding:** SEC-010
**Depends On:** SEC-010-1
**Agent Type:** `general-purpose`

**Task:**
Modify `docker/docker-compose.yml` to add security options:

```yaml
services:
  bot:
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    read_only: true
    tmpfs:
      - /tmp
```

Note: May need to adjust read_only based on data directory needs.

**Acceptance Criteria:**
- [ ] Security options added
- [ ] Container starts successfully
- [ ] Application functions correctly

---

### SEC-011: External API Standardization

#### SEC-011-1: Create API Client Wrapper

**Finding:** SEC-011
**Depends On:** None
**Agent Type:** `general-purpose`

**Task:**
Create `src/utils/api-client.js` with:

```javascript
async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

Export the function for use in service modules.

**Acceptance Criteria:**
- [ ] File exists at `src/utils/api-client.js`
- [ ] Timeout functionality works
- [ ] Error handling is consistent

---

#### SEC-011-2: Update Services to Use API Client

**Finding:** SEC-011
**Depends On:** SEC-011-1
**Agent Type:** `general-purpose`

**Task:**
Update all service files to use the new API client:
- `src/services/advice-api.js`
- `src/services/dadjoke-api.js`
- `src/services/dictionary-api.js`
- `src/services/randomfact-api.js`
- `src/services/trivia-api.js`

Ensure consistent 10-second timeouts and error handling.

**Acceptance Criteria:**
- [ ] All services use api-client wrapper
- [ ] Consistent timeout behavior
- [ ] Error messages don't leak paths

---

## Phase 3: Low Priority Tasks

### SEC-012: Body Parser Limits

#### SEC-012-1: Set Request Body Size Limits

**Finding:** SEC-012
**Depends On:** None
**Agent Type:** `general-purpose`

**Task:**
Modify `src/web/index.js` body parser configuration:

```javascript
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
```

**Acceptance Criteria:**
- [ ] Limits applied to both parsers
- [ ] Large requests rejected with 413 status

---

### SEC-013: Log Sanitization

#### SEC-013-1: Add Sensitive Data Redaction to Logger

**Finding:** SEC-013
**Depends On:** None
**Agent Type:** `general-purpose`

**Task:**
Modify `src/utils/logger.js` to add a format function that redacts sensitive fields:

```javascript
const sensitiveFields = ['password', 'token', 'access_token', 'refresh_token', 'secret'];

function redactSensitive(obj) {
  // Recursively redact sensitive field values
}
```

Apply to Winston format pipeline.

**Acceptance Criteria:**
- [ ] Sensitive fields redacted in logs
- [ ] Normal logging unaffected
- [ ] Redaction is recursive for nested objects

---

## Verification Tasks

### VERIFY-001: Security Headers Check

**Task:**
After SEC-004 completion, verify headers using:
1. Browser DevTools Network tab
2. `curl -I http://localhost:3000`
3. Online tool: securityheaders.com (if publicly accessible)

Expected headers:
- Content-Security-Policy
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Strict-Transport-Security (when HTTPS)

---

### VERIFY-002: Authentication Flow Test

**Task:**
After SEC-001 completion, test:
1. Unauthenticated access redirects to login
2. Login with valid credentials succeeds
3. Login with invalid credentials fails
4. Account locks after 5 failed attempts
5. Logout clears session
6. OAuth callbacks work without login

---

### VERIFY-003: CSRF Protection Test

**Task:**
After SEC-003 completion, test:
1. Forms submit successfully with valid token
2. Forms fail without CSRF token (403 error)
3. Cross-site form submission fails

---

## Summary Checklist

### Phase 1 (Critical/High)
- [ ] SEC-001-1 through SEC-001-7: Admin Authentication
- [ ] SEC-002-1 through SEC-002-4: Token Encryption
- [ ] SEC-003-1 through SEC-003-2: CSRF Protection
- [ ] SEC-004-1: Security Headers
- [ ] SEC-005-1: Session Secret Requirement
- [ ] SEC-006-1: Rate Limiting

### Phase 2 (Medium)
- [ ] SEC-007-1: XSS Prevention Audit
- [ ] SEC-008-1: Session Cookie Security
- [ ] SEC-010-1 through SEC-010-2: Docker Hardening
- [ ] SEC-011-1 through SEC-011-2: External API Standardization

### Phase 3 (Low)
- [ ] SEC-012-1: Body Parser Limits
- [ ] SEC-013-1: Log Sanitization

### Verification
- [ ] VERIFY-001: Security Headers Check
- [ ] VERIFY-002: Authentication Flow Test
- [ ] VERIFY-003: CSRF Protection Test
