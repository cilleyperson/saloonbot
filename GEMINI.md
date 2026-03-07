# GEMINI.md

This file provides project-specific context and development mandates for Saloon Bot, a multi-channel Twitch chatbot with a secure admin interface and ML-powered object detection.

## Project Overview

Saloon Bot is a robust Node.js application that integrates with the Twitch API (via Twurple v8) to provide automated chat services across multiple channels. It features a secure Express.js-based admin dashboard for configuration and management.

### Key Technologies
- **Runtime:** Node.js 20+
- **Twitch Integration:** `twurple` (API, Auth, Chat, EventSub)
- **Database:** SQLite with `better-sqlite3`
- **Web Framework:** Express.js with EJS templates
- **Security:** `bcrypt` (passwords), `otpauth` (2FA), AES-256-GCM (token encryption), `helmet`, `csurf`
- **Machine Learning:** `onnxruntime-node` (YOLOv8) for real-time stream object detection
- **Utilities:** `winston` (logging), `fluent-ffmpeg` & `streamlink` (stream capture)

### Core Architecture
- **AuthManager:** Centralized multi-user `RefreshingAuthProvider`. All Twitch clients (API, Chat, EventSub) MUST share this provider.
- **BotCore:** Singleton managing the lifecycle of all bot components.
- **Repository Pattern:** Database operations are abstracted into repositories (`src/database/repositories/`).
- **Detection Pipeline:** FFmpeg/Streamlink captures frames $\rightarrow$ YOLOv8 analyzes $\rightarrow$ Chat triggers based on rules.

---

## Building and Running

### Essential Commands
```bash
# Install dependencies
npm install

# Run in production
npm start

# Run in development (with watch mode)
npm run dev

# Run tests (Jest)
npm test
npm run test:watch
npm run test:coverage

# Initialization Scripts
npm run create-admin        # Create initial admin user (Required)
npm run generate-certs     # Generate SSL certs for HTTPS
node scripts/download-yolo-model.js # Download YOLOv8 model for detection
node scripts/migrate-tokens.js      # Encrypt existing OAuth tokens
```

---

## Development Conventions

### 1. Database & Migrations
- **Never** perform direct SQL queries. Use the established repository layer in `src/database/repositories/`.
- **Migrations:** Add new `.sql` files to the `migrations/` directory. They are applied automatically on startup via `src/database/schema.js`.

### 2. Security Mandates
- **Redaction:** Use the Winston logger (`src/utils/logger.js`) and ensure sensitive data (passwords, tokens) is never logged.
- **CSRF:** All forms in EJS templates MUST include the CSRF token. Use `${csrfToken}` inside template literals.
- **Authentication:** Admin routes require the `requireAuth` middleware from `src/web/middleware/auth.js`.

### 3. Twitch (Twurple) Integration
- **Auth Provider:** Always use the shared `RefreshingAuthProvider` managed by `AuthManager`.
- **Scopes:** Scopes are defined in `src/config/index.js`. Update this file if new features require additional Twitch permissions.

### 4. EJS Templating Pattern
- Most views use a specific pattern where the body is passed as a template literal to a layout:
  ```ejs
  <%- include('../layout', { body: `
    <div>Content here</div>
    <form>
      <input type="hidden" name="_csrf" value="${csrfToken}">
    </form>
  ` }) %>
  ```
- Use `${variable}` for interpolation inside these template literals, NOT standard `<%= %>` tags (except in `login.ejs`).

### 5. Adding Predefined Commands
1. Define the command name and metadata in `src/database/repositories/predefined-settings-repo.js`.
2. Implement API/service logic in `src/services/`.
3. Add the handler logic to `src/bot/handlers/predefined-command-handler.js`.

### 6. Object Detection
- Detection requires `ffmpeg` and `streamlink` to be installed on the host system.
- The `yolov8n.onnx` model must be present in the `models/` directory.

---

## Directory Structure Highlights
- `src/bot/`: Core bot logic and Twitch event handlers.
- `src/web/`: Express app, routes, and admin interface.
- `src/database/`: SQLite schema, migrations, and repositories.
- `src/services/`: API clients (Trivia, Dad Jokes, etc.) and ML pipeline.
- `src/utils/`: Common utilities for crypto, logging, and templates.
