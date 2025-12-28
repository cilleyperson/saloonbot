# Task 04: Theme System

## Task ID
`P1-T04`

## Prerequisites
- Task 01 (CSS Foundation) completed
- Task 03 (Component Library) completed

## Objective
Implement dark/light theme toggle with system preference detection and localStorage persistence.

## Agent Type
`frontend-mobile-development:frontend-developer`

## Security Requirements
- No sensitive data stored in localStorage
- Theme preference is non-sensitive user preference data
- No external scripts loaded

## Implementation Steps

### Step 1: Create Theme JavaScript

Create `public/js/theme.js`:

```javascript
/**
 * Theme Toggle System
 * Handles dark/light mode switching with persistence and system preference detection
 */
(function() {
  'use strict';

  var THEME_KEY = 'saloonbot-theme';
  var THEME_LIGHT = 'light';
  var THEME_DARK = 'dark';

  /**
   * Get the preferred theme based on stored preference or system setting
   */
  function getPreferredTheme() {
    var stored = localStorage.getItem(THEME_KEY);
    if (stored === THEME_LIGHT || stored === THEME_DARK) {
      return stored;
    }

    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return THEME_DARK;
    }

    return THEME_LIGHT;
  }

  /**
   * Apply a theme to the document
   */
  function setTheme(theme) {
    if (theme !== THEME_LIGHT && theme !== THEME_DARK) {
      theme = THEME_LIGHT;
    }

    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);

    // Update toggle button icons
    updateToggleButton(theme);
  }

  /**
   * Update the toggle button appearance
   */
  function updateToggleButton(theme) {
    var toggleBtn = document.querySelector('.header-theme-toggle');
    if (!toggleBtn) return;

    var sunIcon = toggleBtn.querySelector('.icon-sun');
    var moonIcon = toggleBtn.querySelector('.icon-moon');

    if (sunIcon && moonIcon) {
      // Show sun when dark (clicking will switch to light)
      // Show moon when light (clicking will switch to dark)
      sunIcon.style.display = theme === THEME_DARK ? 'block' : 'none';
      moonIcon.style.display = theme === THEME_LIGHT ? 'block' : 'none';
    }

    // Update aria-label for accessibility
    var label = theme === THEME_DARK ? 'Switch to light mode' : 'Switch to dark mode';
    toggleBtn.setAttribute('aria-label', label);
  }

  /**
   * Toggle between themes
   */
  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme') || THEME_LIGHT;
    var newTheme = current === THEME_LIGHT ? THEME_DARK : THEME_LIGHT;
    setTheme(newTheme);
  }

  /**
   * Initialize the theme system
   */
  function init() {
    // Apply theme immediately to prevent flash
    setTheme(getPreferredTheme());

    // Set up toggle button click handler
    var toggleBtn = document.querySelector('.header-theme-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', toggleTheme);
    }

    // Listen for system preference changes
    if (window.matchMedia) {
      var mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

      // Use the appropriate event listener method
      var listener = function(e) {
        // Only auto-switch if user hasn't manually set a preference
        var stored = localStorage.getItem(THEME_KEY);
        if (!stored) {
          setTheme(e.matches ? THEME_DARK : THEME_LIGHT);
        }
      };

      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', listener);
      } else if (mediaQuery.addListener) {
        // Fallback for older browsers
        mediaQuery.addListener(listener);
      }
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for external use if needed
  window.Theme = {
    set: setTheme,
    toggle: toggleTheme,
    get: function() {
      return document.documentElement.getAttribute('data-theme') || THEME_LIGHT;
    }
  };
})();
```

### Step 2: Add Theme Toggle Button Styles

Append to `public/css/style.css`:

```css
/* ----------------------------------------
   7. Theme Toggle
   ---------------------------------------- */

.header-theme-toggle {
  position: relative;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--text-secondary);
  transition: all var(--transition-fast);
}

.header-theme-toggle:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.header-theme-toggle svg {
  width: 20px;
  height: 20px;
}

.header-theme-toggle .icon-sun,
.header-theme-toggle .icon-moon {
  position: absolute;
  transition: opacity var(--transition-fast), transform var(--transition-fast);
}

/* Initial state - hide sun, show moon (for light theme default) */
.header-theme-toggle .icon-sun {
  display: none;
}

.header-theme-toggle .icon-moon {
  display: block;
}

/* Smooth theme transition */
html {
  transition: background-color var(--transition-normal);
}

html.theme-transitioning,
html.theme-transitioning * {
  transition: background-color var(--transition-normal),
              color var(--transition-normal),
              border-color var(--transition-normal) !important;
}
```

### Step 3: Create SVG Icons for Theme Toggle

These icons will be included in the layout template (Task 05). Document the required SVG markup:

**Sun Icon (for dark mode - click to switch to light):**
```html
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
```

**Moon Icon (for light mode - click to switch to dark):**
```html
<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
</svg>
```

### Step 4: Apply Theme Before Page Render (Prevent Flash)

Add to `src/web/views/layout.ejs` in the `<head>` section (this will be fully implemented in Task 05):

```html
<script>
  // Apply theme immediately to prevent flash of wrong theme
  (function() {
    var theme = localStorage.getItem('saloonbot-theme');
    if (!theme) {
      theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', theme);
  })();
</script>
```

## Testing Requirements

### Manual Testing
1. Default theme matches system preference (if no stored preference)
2. Click toggle button - theme switches
3. Refresh page - theme persists
4. Clear localStorage - reverts to system preference
5. Change system preference (in OS settings) - updates if no stored preference
6. Both light and dark themes display all colors correctly
7. No flash of wrong theme on page load

### Accessibility Testing
1. Toggle button has visible focus state
2. Toggle button has appropriate aria-label
3. Color contrast meets WCAG 2.1 AA in both themes
4. Animations respect prefers-reduced-motion

### Cross-Browser Testing
1. Chrome/Edge - all features work
2. Firefox - all features work
3. Safari - all features work (including matchMedia)

## Git Commit

**Files to Stage:**
- `public/js/theme.js` (new)
- `public/css/style.css` (updated)

**Commit Message:**
```
feat(ui): add dark/light theme toggle system

- Create theme.js with toggle, persistence, and system detection
- Add theme toggle button styles
- Support localStorage persistence
- Detect and respect system color scheme preference
- Prevent flash of wrong theme on page load
- Include smooth transition between themes

Accessibility: aria-label updates on toggle
Phase 1 Task 04: Theme System
```

## Acceptance Criteria

- [ ] Theme toggle button displays in header
- [ ] Clicking toggle switches between light and dark
- [ ] Theme persists across page refreshes
- [ ] System preference detected on first visit
- [ ] No flash of wrong theme on page load
- [ ] Smooth transition animation between themes
- [ ] All colors update correctly in both themes
- [ ] Toggle button accessible with keyboard
- [ ] aria-label updates based on current theme
