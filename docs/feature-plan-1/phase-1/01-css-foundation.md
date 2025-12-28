# Task 01: CSS Foundation

## Task ID
`P1-T01`

## Prerequisites
- None

## Objective
Create the CSS foundation with custom properties for colors, typography, spacing, and breakpoints that will power the entire UI redesign.

## Agent Type
`frontend-mobile-development:frontend-developer`

## Security Requirements
- No security-specific requirements for CSS
- Ensure no sensitive data in CSS comments

## Implementation Steps

### Step 1: Create CSS Custom Properties File Structure

Replace the content of `public/css/style.css` with a well-organized structure:

```css
/* ============================================
   SALOON BOT - ADMIN INTERFACE STYLES
   ============================================ */

/* ----------------------------------------
   1. CSS Custom Properties (Variables)
   ---------------------------------------- */

:root {
  /* Color Palette - Light Theme (Default) */
  --bg-primary: #ffffff;
  --bg-secondary: #f7f7f8;
  --bg-tertiary: #efeff1;
  --bg-elevated: #ffffff;

  --text-primary: #0e0e10;
  --text-secondary: #53535f;
  --text-tertiary: #adadb8;
  --text-link: #6441a5;
  --text-link-hover: #7d5bbe;

  --accent-primary: #9147ff;
  --accent-primary-hover: #772ce8;
  --accent-secondary: #6441a5;

  --status-success: #00c853;
  --status-success-bg: #e8f5e9;
  --status-warning: #ff9800;
  --status-warning-bg: #fff3e0;
  --status-error: #f44336;
  --status-error-bg: #ffebee;
  --status-info: #2196f3;
  --status-info-bg: #e3f2fd;

  --border-primary: #e5e5e8;
  --border-secondary: #dedee3;
  --border-focus: #9147ff;

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);

  /* Typography */
  --font-primary: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Consolas', 'Monaco', monospace;

  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 1.875rem;

  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;

  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.75;

  /* Spacing */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-10: 2.5rem;
  --space-12: 3rem;
  --space-16: 4rem;

  /* Layout */
  --sidebar-width: 240px;
  --header-height: 60px;

  /* Transitions */
  --transition-fast: 0.15s ease;
  --transition-normal: 0.2s ease;
  --transition-slow: 0.3s ease;

  /* Border Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;
}

/* Dark Theme */
[data-theme="dark"] {
  --bg-primary: #0e0e10;
  --bg-secondary: #18181b;
  --bg-tertiary: #1f1f23;
  --bg-elevated: #26262c;

  --text-primary: #efeff1;
  --text-secondary: #adadb8;
  --text-tertiary: #636369;
  --text-link: #bf94ff;
  --text-link-hover: #d4b8ff;

  --accent-primary: #9147ff;
  --accent-primary-hover: #a970ff;
  --accent-secondary: #bf94ff;

  --status-success: #00e676;
  --status-success-bg: #1b3d2f;
  --status-warning: #ffab40;
  --status-warning-bg: #3d3320;
  --status-error: #ff5252;
  --status-error-bg: #3d1f1f;
  --status-info: #40c4ff;
  --status-info-bg: #1f3340;

  --border-primary: #323239;
  --border-secondary: #404049;
  --border-focus: #9147ff;

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.5);
}

/* ----------------------------------------
   2. CSS Reset & Base Styles
   ---------------------------------------- */

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  font-size: 16px;
  -webkit-text-size-adjust: 100%;
}

body {
  font-family: var(--font-primary);
  font-size: var(--text-base);
  line-height: var(--leading-normal);
  color: var(--text-primary);
  background-color: var(--bg-secondary);
  min-height: 100vh;
  transition: background-color var(--transition-normal), color var(--transition-normal);
}

a {
  color: var(--text-link);
  text-decoration: none;
  transition: color var(--transition-fast);
}

a:hover {
  color: var(--text-link-hover);
}

img {
  max-width: 100%;
  height: auto;
}

code {
  font-family: var(--font-mono);
  font-size: 0.875em;
  background: var(--bg-tertiary);
  padding: 0.125em 0.375em;
  border-radius: var(--radius-sm);
}

/* Focus visible for accessibility */
:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

/* Reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* ----------------------------------------
   3. Utility Classes
   ---------------------------------------- */

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.text-center { text-align: center; }
.text-right { text-align: right; }
.text-left { text-align: left; }

.text-primary { color: var(--text-primary); }
.text-secondary { color: var(--text-secondary); }
.text-success { color: var(--status-success); }
.text-error { color: var(--status-error); }
.text-warning { color: var(--status-warning); }

.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hidden { display: none !important; }

/* Spacing utilities */
.mt-1 { margin-top: var(--space-1); }
.mt-2 { margin-top: var(--space-2); }
.mt-3 { margin-top: var(--space-3); }
.mt-4 { margin-top: var(--space-4); }
.mb-1 { margin-bottom: var(--space-1); }
.mb-2 { margin-bottom: var(--space-2); }
.mb-3 { margin-bottom: var(--space-3); }
.mb-4 { margin-bottom: var(--space-4); }

/* Placeholder for components - will be added in subsequent tasks */
```

### Step 2: Verify CSS Loads Correctly

Ensure the CSS file is properly linked in layout.ejs and loads without errors.

### Step 3: Test Variables Work

Create a simple test by temporarily adding a visible element using the new variables to verify they're working.

## Testing Requirements

### Manual Testing
1. Open admin interface in browser
2. Verify no CSS errors in console
3. Verify page still displays (even if unstyled in new system)
4. Use browser dev tools to verify CSS custom properties are defined
5. Check that `:root` and `[data-theme="dark"]` selectors are present

### Automated Testing
- No automated tests for CSS foundation

## Git Commit

**Files to Stage:**
- `public/css/style.css`

**Commit Message:**
```
feat(ui): add CSS foundation with custom properties

- Define color palette for light and dark themes
- Add typography scale and font variables
- Add spacing system with consistent scale
- Add utility classes for common patterns
- Add CSS reset and base styles
- Add reduced motion and focus visible support

Phase 1 Task 01: CSS Foundation
```

## Acceptance Criteria

- [ ] CSS file contains all custom properties from design spec
- [ ] Light theme colors defined in `:root`
- [ ] Dark theme colors defined in `[data-theme="dark"]`
- [ ] Typography scale matches design spec
- [ ] Spacing scale matches design spec
- [ ] CSS loads without errors
- [ ] Reduced motion media query present
- [ ] Focus visible styles present
