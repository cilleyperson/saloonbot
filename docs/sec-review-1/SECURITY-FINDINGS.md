# Security Review Findings - Saloon Bot

**Review Date:** December 2024
**Review Version:** 1.0
**Codebase:** Twitch Saloon Bot (Node.js/Express/Twurple)

---

## Executive Summary

This comprehensive security review identified **14 security findings** across the Saloon Bot codebase. The findings range from critical authentication gaps to lower-severity configuration improvements.

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 4 |
| Medium | 5 |
| Low | 3 |

---

## Critical Findings

### SEC-001: No Authentication on Admin Web Interface

**Severity:** Critical
**Category:** Authentication
**Files:** `src/web/index.js`, `src/web/routes/*.js`

**Description:**
The admin web interface has no authentication mechanism. Anyone with network access to the server can:
- View all connected Twitch channels
- Modify bot configurations
- Create/delete commands
- Access OAuth token management pages
- Revoke channel authorizations

**Impact:**
Complete administrative takeover of the bot. Attackers can manipulate the bot to send malicious messages, access channel data, or disrupt service.

**Evidence:**
```javascript
// src/web/index.js - No auth middleware
app.use('/', dashboardRoutes);
app.use('/auth', authRoutes);
app.use('/channels', channelRoutes);
// All routes are publicly accessible
```

**Remediation:**
Implement authentication middleware with at minimum:
- Login/logout functionality
- Session-based or JWT authentication
- Role-based access control for sensitive operations

---

### SEC-002: OAuth Tokens Stored in Plain Text

**Severity:** Critical
**Category:** Data Protection
**Files:** `src/database/repositories/auth-repo.js`, `src/bot/auth-manager.js`

**Description:**
Twitch OAuth access tokens and refresh tokens are stored in plain text in the SQLite database without encryption.

**Impact:**
If the database file is compromised (file system access, backup exposure, path traversal), attackers gain access to valid OAuth tokens that can:
- Impersonate the bot account
- Access Twitch API on behalf of connected channels
- Read channel subscriptions and follower data
- Perform moderation actions

**Evidence:**
```javascript
// src/database/repositories/auth-repo.js:35-41
function saveBotAuth(data) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO bot_auth (id, bot_username, access_token, refresh_token, scopes, expires_at)
    VALUES (1, ?, ?, ?, ?, ?)
  `);
  // Tokens stored directly without encryption
  stmt.run(botUsername, accessToken, refreshToken, ...);
}
```

**Remediation:**
- Encrypt tokens at rest using AES-256-GCM
- Derive encryption key from environment variable
- Consider using a dedicated secrets manager (HashiCorp Vault, AWS Secrets Manager)

---

## High Findings

### SEC-003: Missing CSRF Protection

**Severity:** High
**Category:** Cross-Site Request Forgery
**Files:** `src/web/index.js`, all route files, all EJS templates

**Description:**
The application has no CSRF protection. All state-changing operations (POST requests) can be triggered by malicious websites if an admin has an active session.

**Impact:**
Attackers can craft malicious pages that, when visited by an authenticated admin, will:
- Create/modify/delete commands
- Change channel settings
- Trigger OAuth flows
- Disconnect channels

**Evidence:**
```javascript
// src/web/index.js - No CSRF middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// Missing: app.use(csrf())
```

**Remediation:**
Install and configure `csurf` or similar CSRF middleware:
```javascript
const csrf = require('csurf');
app.use(csrf({ cookie: true }));
```

---

### SEC-004: Missing Security Headers

**Severity:** High
**Category:** Security Misconfiguration
**Files:** `src/web/index.js`

**Description:**
The Express application does not set security headers:
- No Content-Security-Policy (CSP)
- No X-Content-Type-Options
- No X-Frame-Options
- No X-XSS-Protection
- No Strict-Transport-Security (HSTS)
- No Referrer-Policy

**Impact:**
- XSS attacks are more impactful without CSP
- Clickjacking attacks possible without X-Frame-Options
- MIME-type confusion attacks possible
- No HTTPS enforcement via HSTS

**Remediation:**
Install and configure `helmet` middleware:
```javascript
const helmet = require('helmet');
app.use(helmet());
```

---

### SEC-005: Insecure Default Session Secret

**Severity:** High
**Category:** Security Misconfiguration
**Files:** `src/config/index.js`

**Description:**
The session secret has an insecure default value that may be used in production if not explicitly configured.

**Evidence:**
```javascript
// src/config/index.js:23
sessionSecret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
```

**Impact:**
If deployed with the default secret, attackers can:
- Forge session cookies
- Hijack admin sessions
- Gain unauthorized access

**Remediation:**
- Make SESSION_SECRET a required environment variable
- Fail startup if not provided in production mode
- Remove the default value entirely

---

### SEC-006: Missing Rate Limiting

**Severity:** High
**Category:** Denial of Service
**Files:** `src/web/index.js`, all route files

**Description:**
No rate limiting is implemented on any routes, including:
- OAuth callback endpoints
- Form submissions
- API-like operations

**Impact:**
- Brute force attacks on any future authentication
- Resource exhaustion attacks
- OAuth token exhaustion
- Excessive database writes

**Remediation:**
Install and configure `express-rate-limit`:
```javascript
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100
});
app.use(limiter);
```

---

## Medium Findings

### SEC-007: Potential XSS via Unescaped Template Output

**Severity:** Medium
**Category:** Cross-Site Scripting
**Files:** `src/web/views/layout.ejs`, various templates

**Description:**
The layout template uses unescaped output for the body content, and several templates use `<%-` for rendering dynamic content.

**Evidence:**
```ejs
<!-- src/web/views/layout.ejs:39 -->
<%- body %>
```

**Impact:**
If user-controlled data is rendered without proper escaping in child templates, XSS attacks become possible. While most user input is rendered with `<%= %>` (escaped), the pattern creates risk for future development.

**Remediation:**
- Audit all uses of `<%- %>` in templates
- Ensure user-controlled data always uses `<%= %>`
- Consider adding Content-Security-Policy to mitigate impact

---

### SEC-008: Session Cookie Missing SameSite Attribute

**Severity:** Medium
**Category:** Session Security
**Files:** `src/web/index.js`

**Description:**
The session cookie configuration does not explicitly set the `sameSite` attribute.

**Evidence:**
```javascript
// src/web/index.js:41-45
cookie: {
  secure: config.isProduction,
  httpOnly: true,
  maxAge: 24 * 60 * 60 * 1000
  // Missing: sameSite: 'strict' or 'lax'
}
```

**Impact:**
Without explicit SameSite setting, browsers may use permissive defaults that allow cross-site request attacks.

**Remediation:**
Add `sameSite: 'strict'` or `sameSite: 'lax'` to cookie configuration.

---

### SEC-009: Error Information Disclosure in Development Mode

**Severity:** Medium
**Category:** Information Disclosure
**Files:** `src/web/index.js`

**Description:**
In development mode, full error messages and stack traces are exposed to users.

**Evidence:**
```javascript
// src/web/index.js:102-106
res.status(err.status || 500).render('error', {
  title: 'Error',
  message: config.isDevelopment ? err.message : 'An error occurred',
  error: config.isDevelopment ? err : { status: err.status || 500 }
});
```

**Impact:**
Stack traces can reveal:
- File system paths
- Internal module names
- Database query structures
- Potential attack vectors

**Remediation:**
This pattern is acceptable if NODE_ENV is properly set in production. Ensure deployment documentation emphasizes setting `NODE_ENV=production`.

---

### SEC-010: Docker Container Security Issues

**Severity:** Medium
**Category:** Container Security
**Files:** `docker/Dockerfile`, `docker/docker-compose.yml`

**Description:**
The Docker configuration has several security concerns:
- Container runs as root user
- No read-only filesystem option
- No security options (no-new-privileges, seccomp)
- Volumes may expose sensitive data

**Remediation:**
```dockerfile
# Add non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
```

```yaml
# docker-compose.yml
services:
  bot:
    security_opt:
      - no-new-privileges:true
    read_only: true
```

---

### SEC-011: External API Timeout and Error Handling

**Severity:** Medium
**Category:** Availability
**Files:** `src/services/*.js`

**Description:**
External API calls (advice, dad jokes, dictionary, trivia) have varying timeout handling and error responses could leak internal paths in some error scenarios.

**Evidence:**
```javascript
// src/services/trivia-api.js - Has timeout
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 15000);

// src/services/advice-api.js - No explicit timeout
const response = await fetch('https://api.adviceslip.com/advice');
```

**Impact:**
- Inconsistent timeout handling can cause slow responses
- External API failures can hang requests
- Error messages might expose internal details

**Remediation:**
- Standardize timeout handling across all API services
- Use a wrapper function with consistent error handling
- Ensure error messages don't expose internal paths

---

## Low Findings

### SEC-012: No Input Size Limits on Request Bodies

**Severity:** Low
**Category:** Denial of Service
**Files:** `src/web/index.js`

**Description:**
No explicit limit is set on JSON or URL-encoded body parsers, using Express defaults.

**Evidence:**
```javascript
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
```

**Remediation:**
Add explicit limits:
```javascript
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
```

---

### SEC-013: Potential Token Logging

**Severity:** Low
**Category:** Sensitive Data Exposure
**Files:** `src/bot/auth-manager.js`, `src/utils/logger.js`

**Description:**
While no direct token logging was observed, the logging infrastructure could potentially log sensitive data if debug levels are enabled or error handling changes.

**Remediation:**
- Add a sanitization layer to logger for known sensitive fields
- Audit all logger.debug() calls for sensitive data
- Consider redacting tokens in error stack traces

---

### SEC-014: SSL Certificate Script Security

**Severity:** Low
**Category:** Security Misconfiguration
**Files:** `scripts/generate-certs.sh`

**Description:**
The certificate generation script creates self-signed certificates which are intended for development only but may be mistakenly used in production.

**Remediation:**
- Add prominent warnings in the script output
- Document proper certificate acquisition for production
- Consider adding checks to prevent self-signed certs in production mode

---

## Security Recommendations Summary

### Immediate Actions (Critical/High)
1. Implement admin authentication system
2. Encrypt OAuth tokens at rest
3. Add CSRF protection
4. Install and configure helmet for security headers
5. Require SESSION_SECRET environment variable
6. Implement rate limiting

### Short-term Actions (Medium)
7. Audit and fix XSS-prone template patterns
8. Add SameSite to session cookies
9. Harden Docker container configuration
10. Standardize external API error handling

### Ongoing Improvements (Low)
11. Set explicit body parser limits
12. Implement log sanitization
13. Document production SSL requirements

---

## Appendix: Files Reviewed

- `src/web/index.js`
- `src/web/routes/auth.js`
- `src/web/routes/channels.js`
- `src/web/routes/commands.js`
- `src/web/routes/counters.js`
- `src/web/routes/chat-memberships.js`
- `src/web/routes/predefined-commands.js`
- `src/web/routes/dashboard.js`
- `src/web/views/*.ejs` (all templates)
- `src/bot/auth-manager.js`
- `src/bot/index.js`
- `src/bot/handlers/*.js`
- `src/database/repositories/*.js`
- `src/database/index.js`
- `src/database/schema.js`
- `src/config/index.js`
- `src/utils/logger.js`
- `src/utils/template.js`
- `src/services/*.js`
- `docker/Dockerfile`
- `docker/docker-compose.yml`
- `docker/docker-compose.dev.yml`
- `scripts/generate-certs.sh`
- `.env.example`
