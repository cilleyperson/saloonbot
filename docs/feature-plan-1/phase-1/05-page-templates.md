# Task 05: Page Templates

## Task ID
`P1-T05`

## Prerequisites
- Task 01 (CSS Foundation) completed
- Task 02 (Layout System) completed
- Task 03 (Component Library) completed
- Task 04 (Theme System) completed

## Objective
Update all EJS templates to use the new layout structure, component classes, and responsive design patterns.

## Agent Type
`frontend-mobile-development:frontend-developer`

## Security Requirements
- Maintain all existing CSRF token implementations
- Keep escapeHtml functions in all templates
- Preserve XSS protections in dynamic content
- Ensure authentication checks remain in place

## Implementation Steps

### Step 1: Update Main Layout Template

Update `src/web/views/layout.ejs`:

```ejs
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="ie=edge">
  <title><%= typeof title !== 'undefined' ? title + ' - Saloon Bot' : 'Saloon Bot' %></title>
  <link rel="stylesheet" href="/css/style.css">
  <script>
    // Apply theme immediately to prevent flash
    (function() {
      var theme = localStorage.getItem('saloonbot-theme');
      if (!theme) {
        theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      document.documentElement.setAttribute('data-theme', theme);
    })();
  </script>
</head>
<body>
  <div class="app">
    <!-- Header -->
    <header class="header">
      <div class="header-start">
        <button class="btn btn-icon header-menu-toggle" aria-label="Toggle navigation" aria-expanded="false">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M3 5h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2z"/>
          </svg>
        </button>
        <a href="/" class="header-logo">
          <span>Saloon Bot</span>
        </a>
      </div>

      <div class="header-end">
        <button class="header-theme-toggle" aria-label="Switch to dark mode">
          <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
          <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        </button>
        <% if (typeof user !== 'undefined' && user) { %>
          <div class="header-user">
            <span class="header-user-name"><%= user.username %></span>
            <a href="/auth/logout" class="btn btn-ghost btn-sm">Logout</a>
          </div>
        <% } %>
      </div>
    </header>

    <div class="app-body">
      <!-- Sidebar -->
      <% if (typeof user !== 'undefined' && user) { %>
      <aside class="sidebar" data-sidebar>
        <nav class="sidebar-nav">
          <a href="/" class="sidebar-link <%= typeof activePage !== 'undefined' && activePage === 'dashboard' ? 'active' : '' %>">
            <svg class="sidebar-icon" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/>
            </svg>
            <span>Dashboard</span>
          </a>

          <% if (typeof channel !== 'undefined' && channel) { %>
          <div class="sidebar-section">
            <span class="sidebar-section-title"><%= channel.display_name || channel.twitch_username %></span>

            <a href="/channels/<%= channel.id %>" class="sidebar-link <%= typeof activePage !== 'undefined' && activePage === 'channel-overview' ? 'active' : '' %>">
              <svg class="sidebar-icon" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/>
                <path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"/>
              </svg>
              <span>Overview</span>
            </a>

            <a href="/channels/<%= channel.id %>/commands" class="sidebar-link <%= typeof activePage !== 'undefined' && activePage === 'commands' ? 'active' : '' %>">
              <svg class="sidebar-icon" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
              </svg>
              <span>Commands</span>
            </a>

            <a href="/channels/<%= channel.id %>/counters" class="sidebar-link <%= typeof activePage !== 'undefined' && activePage === 'counters' ? 'active' : '' %>">
              <svg class="sidebar-icon" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 11H9v-2h2v2zm0-4H9V5h2v4z"/>
              </svg>
              <span>Counters</span>
            </a>

            <a href="/channels/<%= channel.id %>/predefined" class="sidebar-link <%= typeof activePage !== 'undefined' && activePage === 'predefined' ? 'active' : '' %>">
              <svg class="sidebar-icon" viewBox="0 0 20 20" fill="currentColor">
                <path d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h10v10H5V5z"/>
              </svg>
              <span>Predefined</span>
            </a>

            <a href="/channels/<%= channel.id %>/chat-memberships" class="sidebar-link <%= typeof activePage !== 'undefined' && activePage === 'memberships' ? 'active' : '' %>">
              <svg class="sidebar-icon" viewBox="0 0 20 20" fill="currentColor">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z"/>
              </svg>
              <span>Memberships</span>
            </a>

            <a href="/channels/<%= channel.id %>/settings" class="sidebar-link <%= typeof activePage !== 'undefined' && activePage === 'settings' ? 'active' : '' %>">
              <svg class="sidebar-icon" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/>
              </svg>
              <span>Settings</span>
            </a>
          </div>
          <% } %>
        </nav>
      </aside>
      <% } %>

      <!-- Main Content -->
      <main class="main-content">
        <% if (typeof flash !== 'undefined') { %>
          <% if (flash.success) { %>
            <div class="alert alert-success"><%= flash.success %></div>
          <% } %>
          <% if (flash.error) { %>
            <div class="alert alert-error"><%= flash.error %></div>
          <% } %>
          <% if (flash.info) { %>
            <div class="alert alert-info"><%= flash.info %></div>
          <% } %>
        <% } %>

        <%- body %>
      </main>
    </div>
  </div>

  <script src="/js/navigation.js"></script>
  <script src="/js/theme.js"></script>
  <script src="/js/toast.js"></script>
</body>
</html>
```

### Step 2: Update Each Page Template

Update each template to use the new component classes. The key changes for each template:

1. Replace old class names with new component classes
2. Add `activePage` variable for sidebar highlighting
3. Use new card, table, form, and button classes
4. Ensure CSRF tokens remain in place
5. Keep escapeHtml functions for XSS protection

**Example pattern for list pages:**
```ejs
<%- include('../layout', { body: `
<div class="page">
  ${(function() {
    const escapeHtml = (str) => {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };

    return `
  <div class="page-header">
    <div class="page-header-content">
      <a href="/channels/${channel.id}" class="back-link">&larr; Back to Channel</a>
      <h1 class="page-title">Page Title</h1>
    </div>
    <div class="page-header-actions">
      <a href="/add" class="btn btn-primary">Add Item</a>
    </div>
  </div>

  <div class="page-content">
    <div class="card">
      <div class="table-container">
        <table class="table">
          <!-- Table content -->
        </table>
      </div>
    </div>
  </div>
    `;
  })()}
</div>
`, activePage: 'pagename' }) %>
```

### Step 3: Files to Update

Update all templates in the following directories:
- `src/web/views/dashboard.ejs`
- `src/web/views/login.ejs`
- `src/web/views/error.ejs`
- `src/web/views/channels/*.ejs`
- `src/web/views/commands/*.ejs`
- `src/web/views/counters/*.ejs`
- `src/web/views/chat-memberships/*.ejs`
- `src/web/views/predefined-commands/*.ejs`

### Step 4: Update Login Page (No Sidebar)

The login page should not show the sidebar. Update to use a centered card layout:

```ejs
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login - Saloon Bot</title>
  <link rel="stylesheet" href="/css/style.css">
  <script>
    (function() {
      var theme = localStorage.getItem('saloonbot-theme');
      if (!theme) {
        theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      document.documentElement.setAttribute('data-theme', theme);
    })();
  </script>
</head>
<body>
  <div class="login-page">
    <div class="login-container">
      <div class="login-header">
        <h1>Saloon Bot</h1>
        <p>Admin Dashboard</p>
      </div>

      <% if (typeof flash !== 'undefined' && flash.error) { %>
        <div class="alert alert-error"><%= flash.error %></div>
      <% } %>

      <div class="card">
        <div class="card-body">
          <form method="POST" action="/auth/login">
            <input type="hidden" name="_csrf" value="<%= csrfToken %>">

            <div class="form-group">
              <label for="username" class="form-label">Username</label>
              <input type="text" id="username" name="username" class="form-input" required autofocus>
            </div>

            <div class="form-group">
              <label for="password" class="form-label">Password</label>
              <input type="password" id="password" name="password" class="form-input" required>
            </div>

            <button type="submit" class="btn btn-primary btn-lg" style="width: 100%;">Login</button>
          </form>
        </div>
      </div>
    </div>
  </div>

  <script src="/js/theme.js"></script>
</body>
</html>
```

Add login page styles to CSS:
```css
/* Login Page */
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background: var(--bg-secondary);
}

.login-container {
  width: 100%;
  max-width: 400px;
}

.login-header {
  text-align: center;
  margin-bottom: var(--space-6);
}

.login-header h1 {
  font-size: var(--text-3xl);
  font-weight: var(--font-bold);
  color: var(--accent-primary);
  margin-bottom: var(--space-2);
}

.login-header p {
  color: var(--text-secondary);
}
```

## Testing Requirements

### Manual Testing
1. Test each page on desktop, tablet, and mobile
2. Verify sidebar navigation works correctly
3. Verify active page highlighting
4. Test all forms submit correctly with CSRF
5. Verify flash messages display correctly
6. Test theme toggle on all pages
7. Verify responsive breakpoints work

### Security Testing
1. Verify CSRF tokens present on all forms
2. Test XSS payloads in all input fields
3. Verify escapeHtml functions work
4. Confirm authentication required on protected pages

### Cross-Browser Testing
1. Chrome - all pages render correctly
2. Firefox - all pages render correctly
3. Safari - all pages render correctly
4. Mobile browsers - touch interactions work

## Git Commit

**Files to Stage:**
- `src/web/views/layout.ejs`
- `src/web/views/login.ejs`
- `src/web/views/dashboard.ejs`
- `src/web/views/error.ejs`
- All files in `src/web/views/channels/`
- All files in `src/web/views/commands/`
- All files in `src/web/views/counters/`
- All files in `src/web/views/chat-memberships/`
- All files in `src/web/views/predefined-commands/`
- `public/css/style.css` (login styles)

**Commit Message:**
```
feat(ui): update all page templates with new design system

- Update layout.ejs with header, sidebar, responsive structure
- Add theme toggle and navigation JavaScript integration
- Update dashboard with new stats grid and cards
- Update all channel management pages
- Update command and counter list/form pages
- Update predefined command pages
- Update login page with centered card layout
- Add sidebar navigation with active state
- Maintain all CSRF tokens and XSS protections

Security: All existing protections maintained
Phase 1 Task 05: Page Templates
```

## Acceptance Criteria

- [ ] Layout template includes header, sidebar, main content
- [ ] All pages use new component classes
- [ ] Sidebar shows correct active page
- [ ] Theme toggle works on all pages
- [ ] All forms have CSRF tokens
- [ ] All dynamic content escaped properly
- [ ] Login page has centered card layout
- [ ] Flash messages display with new styles
- [ ] All pages responsive at all breakpoints
- [ ] Navigation JavaScript integrated
