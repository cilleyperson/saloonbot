# Stream Object Detection - Security Considerations

## Overview

This document outlines security requirements, potential vulnerabilities, and mitigation strategies for the stream object detection feature. Security must be a primary consideration throughout implementation.

---

## Threat Model

### Assets to Protect

1. **Bot OAuth Tokens**: Used to send chat messages
2. **Channel Configurations**: Detection settings and rules
3. **Twitch API Credentials**: Client ID and secret
4. **Stream Data**: Video frames being processed
5. **System Resources**: CPU, memory, network bandwidth
6. **Admin Session**: Web interface access

### Threat Actors

1. **Malicious Streamer**: Could try to exploit detection to spam or abuse
2. **External Attacker**: Could try to access admin interface or inject malicious data
3. **Malicious Input**: Crafted images or streams designed to exploit vulnerabilities

---

## Security Requirements

### SR-1: Authentication & Authorization

**Requirement**: All detection configuration endpoints must require authentication.

**Implementation**:
```javascript
// All routes must use requireAuth middleware
router.use(requireAuth);

// Example route
router.get('/detection/channels/:id', requireAuth, async (req, res) => {
  // Verify user has access to this channel
  const channel = await channelRepo.findById(req.params.id);
  if (!channel || channel.user_id !== req.session.userId) {
    return res.status(403).render('error', { message: 'Access denied' });
  }
  // ... handle request
});
```

**Tests Required**:
- [ ] Unauthenticated requests are rejected with 401/403
- [ ] Users can only access their own channel configurations
- [ ] Session expiration is enforced

---

### SR-2: Input Validation

**Requirement**: All user inputs must be validated and sanitized.

**Implementation**:

#### Stream URL Validation
```javascript
function validateStreamUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required' };
  }

  // Only allow Twitch URLs or validated custom URLs
  const twitchPattern = /^https:\/\/(www\.)?twitch\.tv\/[a-zA-Z0-9_]{4,25}$/;

  if (!twitchPattern.test(url)) {
    return { valid: false, error: 'Invalid Twitch URL format' };
  }

  return { valid: true };
}
```

#### Object Class Validation
```javascript
const VALID_CLASSES = require('../constants/yolo-classes').getAllClasses();

function validateObjectClass(className) {
  if (!className || typeof className !== 'string') {
    return false;
  }
  return VALID_CLASSES.includes(className.toLowerCase());
}
```

#### Confidence Threshold Validation
```javascript
function validateConfidence(value) {
  const num = parseFloat(value);
  return !isNaN(num) && num >= 0 && num <= 1;
}
```

#### Message Template Validation
```javascript
function validateMessageTemplate(template) {
  if (!template || typeof template !== 'string') {
    return { valid: false, error: 'Template is required' };
  }

  // Limit length to prevent abuse
  if (template.length > 500) {
    return { valid: false, error: 'Template too long (max 500 characters)' };
  }

  // Only allow whitelisted variables
  const allowedVars = ['object', 'confidence', 'confidence_pct', 'count', 'streamer', 'time'];
  const usedVars = template.match(/\{(\w+)\}/g) || [];

  for (const varMatch of usedVars) {
    const varName = varMatch.slice(1, -1);
    if (!allowedVars.includes(varName)) {
      return { valid: false, error: `Invalid variable: ${varName}` };
    }
  }

  return { valid: true };
}
```

**Tests Required**:
- [ ] SQL injection attempts are blocked
- [ ] XSS attempts are blocked
- [ ] Path traversal attempts are blocked
- [ ] Invalid object classes are rejected
- [ ] Out-of-range confidence values are rejected
- [ ] Overly long inputs are rejected

---

### SR-3: CSRF Protection

**Requirement**: All state-changing operations must be protected against CSRF.

**Implementation**:
```javascript
// Use existing csurf middleware
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: true });

router.use(csrfProtection);

// Include token in all forms
// In EJS templates:
// <input type="hidden" name="_csrf" value="${csrfToken}">
```

**Tests Required**:
- [ ] Requests without CSRF token are rejected
- [ ] Requests with invalid CSRF token are rejected
- [ ] Valid CSRF tokens are accepted

---

### SR-4: Rate Limiting

**Requirement**: API endpoints must be rate limited to prevent abuse.

**Implementation**:
```javascript
const rateLimit = require('express-rate-limit');

// Detection-specific rate limits
const detectionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many requests, please try again later'
});

const startMonitorLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 start requests per minute
  message: 'Too many monitor start requests'
});

router.use('/detection', detectionLimiter);
router.post('/detection/channels/:id/start', startMonitorLimiter);
```

**Tests Required**:
- [ ] Rate limits are enforced
- [ ] Legitimate traffic is not blocked
- [ ] Rate limit headers are included in responses

---

### SR-5: Secure Stream Handling

**Requirement**: Stream data must be handled securely to prevent exploits.

**Implementation**:

#### Frame Buffer Limits
```javascript
const MAX_FRAME_SIZE = 10 * 1024 * 1024; // 10MB max frame size
const MAX_BUFFER_COUNT = 10; // Max frames in buffer

function validateFrame(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Invalid frame data');
  }

  if (buffer.length > MAX_FRAME_SIZE) {
    throw new Error('Frame exceeds maximum size');
  }

  // Validate image header (JPEG or PNG)
  const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8;
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50;

  if (!isJpeg && !isPng) {
    throw new Error('Invalid image format');
  }

  return true;
}
```

#### Memory Protection
```javascript
class FrameBuffer {
  constructor(maxSize = MAX_BUFFER_COUNT) {
    this.maxSize = maxSize;
    this.frames = [];
  }

  push(frame) {
    validateFrame(frame);

    this.frames.push(frame);

    // Remove oldest frames if buffer is full
    while (this.frames.length > this.maxSize) {
      this.frames.shift();
    }
  }

  clear() {
    this.frames = [];
    // Force garbage collection hint
    if (global.gc) {
      global.gc();
    }
  }
}
```

**Tests Required**:
- [ ] Oversized frames are rejected
- [ ] Invalid image formats are rejected
- [ ] Buffer limits are enforced
- [ ] Memory is properly released

---

### SR-6: Message Content Security

**Requirement**: Messages sent to chat must be sanitized to prevent abuse.

**Implementation**:
```javascript
const { sanitizeMessage } = require('../utils/template');

function formatDetectionMessage(template, variables) {
  // Apply template substitution
  let message = formatTemplate(template, variables);

  // Use existing sanitizeMessage function
  // This removes @everyone/@here and limits length
  message = sanitizeMessage(message, 500);

  // Additional detection-specific sanitization
  // Remove any URLs that might have been injected
  message = message.replace(/https?:\/\/[^\s]+/gi, '[link removed]');

  return message;
}
```

**Tests Required**:
- [ ] @everyone/@here mentions are removed
- [ ] Message length is limited
- [ ] Injected URLs are removed
- [ ] Template variables are properly escaped

---

### SR-7: Process Isolation

**Requirement**: Detection processes should be isolated to limit impact of vulnerabilities.

**Implementation**:

#### FFmpeg Process Limits
```javascript
const { spawn } = require('child_process');

function createFFmpegProcess(streamUrl) {
  const process = spawn('ffmpeg', [
    '-i', streamUrl,
    // Limit resource usage
    '-threads', '1',
    '-filter_threads', '1',
    // Other options...
  ], {
    // Limit child process resources
    stdio: ['pipe', 'pipe', 'pipe'],
    // Don't inherit environment variables that might be sensitive
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME
    }
  });

  // Set timeout to kill hung processes
  const timeout = setTimeout(() => {
    process.kill('SIGKILL');
  }, 60000); // 1 minute max per operation

  process.on('exit', () => clearTimeout(timeout));

  return process;
}
```

#### Python Process Isolation (if used)
```javascript
function createPythonWorker() {
  const worker = spawn('python3', ['detection_worker.py'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      PATH: process.env.PATH,
      PYTHONPATH: './python',
      // Limit to required environment only
    },
    // Resource limits (Linux only)
    ...(process.platform === 'linux' ? {
      uid: 65534, // nobody user
      gid: 65534
    } : {})
  });

  return worker;
}
```

**Tests Required**:
- [ ] Processes terminate on timeout
- [ ] Crashed processes are restarted safely
- [ ] Environment isolation is effective

---

### SR-8: Logging & Audit Trail

**Requirement**: Security-relevant events must be logged for audit purposes.

**Implementation**:
```javascript
const { createChildLogger } = require('../utils/logger');
const securityLogger = createChildLogger('security');

function logSecurityEvent(event, details) {
  securityLogger.warn('Security event', {
    event,
    ...details,
    timestamp: new Date().toISOString(),
    // Don't log sensitive data
    ...(details.password && { password: '[REDACTED]' }),
    ...(details.token && { token: '[REDACTED]' })
  });
}

// Usage examples:
logSecurityEvent('authentication_failure', { username, ip: req.ip });
logSecurityEvent('rate_limit_exceeded', { endpoint, ip: req.ip });
logSecurityEvent('invalid_input', { field, value: '[REDACTED]', ip: req.ip });
logSecurityEvent('config_change', { channelId, action, adminId });
```

**Events to Log**:
- Authentication failures
- Authorization failures
- Rate limit exceeded
- Invalid input attempts
- Configuration changes
- Monitor start/stop
- Errors during detection

**Tests Required**:
- [ ] Security events are logged
- [ ] Sensitive data is not logged
- [ ] Log format is consistent

---

### SR-9: Dependency Security

**Requirement**: Third-party dependencies must be vetted and kept updated.

**Implementation**:

#### Dependency Audit
```bash
# Run before each release
npm audit

# Fix vulnerabilities
npm audit fix
```

#### Dependency Allowlist
New dependencies for this feature:
- `fluent-ffmpeg` - Well-maintained, widely used
- `onnxruntime-node` - Microsoft-maintained, security-focused
- `@ultralytics/yolo` - Only if Python fallback needed

#### Version Pinning
```json
{
  "dependencies": {
    "fluent-ffmpeg": "^2.1.2",
    "onnxruntime-node": "^1.16.0"
  }
}
```

**Tests Required**:
- [ ] No known vulnerabilities in dependencies
- [ ] Dependencies are from trusted sources
- [ ] Lockfile is committed and reviewed

---

### SR-10: Error Handling

**Requirement**: Errors must not leak sensitive information.

**Implementation**:
```javascript
// Generic error handler for detection routes
function detectionErrorHandler(err, req, res, next) {
  // Log full error internally
  logger.error('Detection error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // Return generic message to user
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500
    ? 'An internal error occurred'
    : err.message;

  if (req.accepts('html')) {
    res.status(statusCode).render('error', {
      message,
      // Never expose stack traces in production
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  } else {
    res.status(statusCode).json({ error: message });
  }
}
```

**Tests Required**:
- [ ] Stack traces are not exposed in production
- [ ] Internal paths are not exposed
- [ ] Error messages are user-friendly

---

## Security Checklist

### Before Implementation

- [ ] Review this document with team
- [ ] Set up security logging
- [ ] Configure rate limiting
- [ ] Audit existing dependencies

### During Implementation

- [ ] Use parameterized queries (existing pattern)
- [ ] Validate all inputs at entry points
- [ ] Sanitize all outputs
- [ ] Use CSRF tokens on all forms
- [ ] Add authentication to all routes
- [ ] Implement rate limiting
- [ ] Log security events

### Before Release

- [ ] Run `npm audit`
- [ ] Run security-focused tests
- [ ] Review all new code for security issues
- [ ] Test authentication/authorization
- [ ] Test input validation
- [ ] Verify error messages don't leak info
- [ ] Check logging doesn't include secrets

### Post-Release

- [ ] Monitor security logs
- [ ] Watch for unusual patterns
- [ ] Keep dependencies updated
- [ ] Respond to security reports promptly

---

## Security Testing Requirements

| Test Category | Minimum Coverage |
|---------------|------------------|
| Authentication tests | 100% of endpoints |
| Authorization tests | 100% of data access |
| Input validation tests | All input fields |
| Rate limiting tests | All API endpoints |
| CSRF tests | All POST/PUT/DELETE routes |
| Error handling tests | All error paths |

---

## Incident Response

If a security vulnerability is discovered:

1. **Contain**: Disable affected features if necessary
2. **Assess**: Determine scope and impact
3. **Fix**: Develop and test patch
4. **Deploy**: Roll out fix to all instances
5. **Notify**: Inform affected users if data was exposed
6. **Review**: Conduct post-incident analysis
