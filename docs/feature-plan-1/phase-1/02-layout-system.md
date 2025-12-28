# Task 02: Layout System

## Task ID
`P1-T02`

## Prerequisites
- Task 01 (CSS Foundation) completed

## Objective
Implement the responsive layout system including header, sidebar, and main content area with mobile navigation support.

## Agent Type
`frontend-mobile-development:frontend-developer`

## Security Requirements
- Ensure logout link in header uses proper CSRF handling if needed
- Keep authentication state display secure (don't expose sensitive data)

## Implementation Steps

### Step 1: Add Layout CSS to style.css

Append the following to `public/css/style.css`:

```css
/* ----------------------------------------
   4. Layout System
   ---------------------------------------- */

/* App Container */
.app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.app-body {
  display: flex;
  flex: 1;
  padding-top: var(--header-height);
}

/* Header */
.header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--header-height);
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-primary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-4);
  z-index: 100;
  transition: background-color var(--transition-normal);
}

.header-start,
.header-end {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 0 var(--space-4);
}

.header-logo {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-weight: var(--font-bold);
  font-size: var(--text-lg);
  color: var(--text-primary);
}

.header-logo:hover {
  color: var(--accent-primary);
}

.header-logo img {
  height: 32px;
  width: auto;
}

.header-menu-toggle {
  display: none;
}

.header-channel-select {
  max-width: 200px;
}

.header-user {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.header-user-name {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

/* Sidebar */
.sidebar {
  position: fixed;
  top: var(--header-height);
  left: 0;
  bottom: 0;
  width: var(--sidebar-width);
  background: var(--bg-elevated);
  border-right: 1px solid var(--border-primary);
  overflow-y: auto;
  transition: transform var(--transition-normal), background-color var(--transition-normal);
  z-index: 90;
}

.sidebar-nav {
  padding: var(--space-4);
}

.sidebar-section {
  margin-bottom: var(--space-6);
}

.sidebar-section-title {
  display: block;
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-tertiary);
  padding: var(--space-2) var(--space-3);
  margin-bottom: var(--space-1);
}

.sidebar-link {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  transition: all var(--transition-fast);
}

.sidebar-link:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.sidebar-link.active {
  background: var(--accent-primary);
  color: white;
}

.sidebar-link.active:hover {
  background: var(--accent-primary-hover);
}

.sidebar-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

/* Sidebar Overlay (for mobile) */
.sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  opacity: 0;
  visibility: hidden;
  transition: opacity var(--transition-normal), visibility var(--transition-normal);
  z-index: 85;
}

.sidebar-overlay.active {
  opacity: 1;
  visibility: visible;
}

/* Main Content */
.main-content {
  flex: 1;
  margin-left: var(--sidebar-width);
  min-width: 0;
  transition: margin-left var(--transition-normal);
}

/* Page Structure */
.page {
  padding: var(--space-6);
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-6);
  gap: var(--space-4);
}

.page-header-content {
  flex: 1;
  min-width: 0;
}

.page-header-actions {
  display: flex;
  gap: var(--space-3);
  flex-shrink: 0;
}

.page-title {
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  color: var(--text-primary);
  margin-bottom: var(--space-1);
}

.page-subtitle {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.page-content {
  /* Content container */
}

/* Breadcrumb */
.breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin-bottom: var(--space-2);
}

.breadcrumb a {
  color: var(--text-secondary);
}

.breadcrumb a:hover {
  color: var(--accent-primary);
}

.breadcrumb span:not(:last-child) {
  color: var(--text-tertiary);
}

/* Back Link */
.back-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin-bottom: var(--space-2);
}

.back-link:hover {
  color: var(--accent-primary);
}

/* ----------------------------------------
   5. Responsive Breakpoints
   ---------------------------------------- */

/* Tablet */
@media (max-width: 1023px) {
  .header-menu-toggle {
    display: flex;
  }

  .header-center {
    display: none;
  }

  .sidebar {
    transform: translateX(-100%);
  }

  .sidebar.open {
    transform: translateX(0);
  }

  .main-content {
    margin-left: 0;
  }
}

/* Mobile */
@media (max-width: 767px) {
  .page {
    padding: var(--space-4);
  }

  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .page-header-actions {
    justify-content: flex-start;
  }

  .page-title {
    font-size: var(--text-xl);
  }

  .header-user-name {
    display: none;
  }
}
```

### Step 2: Create Navigation JavaScript

Create `public/js/navigation.js`:

```javascript
/**
 * Mobile Navigation Handler
 * Manages sidebar toggle for tablet/mobile views
 */
(function() {
  'use strict';

  const sidebar = document.querySelector('[data-sidebar]');
  const menuToggle = document.querySelector('.header-menu-toggle');

  if (!sidebar || !menuToggle) return;

  // Create overlay element
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  document.body.appendChild(overlay);

  function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    menuToggle.setAttribute('aria-expanded', 'true');
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    menuToggle.setAttribute('aria-expanded', 'false');
  }

  function toggleSidebar() {
    if (sidebar.classList.contains('open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  // Event listeners
  menuToggle.addEventListener('click', toggleSidebar);
  overlay.addEventListener('click', closeSidebar);

  // Close on escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) {
      closeSidebar();
    }
  });

  // Close on navigation (for single-page feel)
  sidebar.querySelectorAll('.sidebar-link').forEach(function(link) {
    link.addEventListener('click', function() {
      if (window.innerWidth < 1024) {
        closeSidebar();
      }
    });
  });

  // Handle resize
  let resizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      if (window.innerWidth >= 1024) {
        closeSidebar();
      }
    }, 100);
  });
})();
```

### Step 3: Update Layout Template

This step will be implemented as part of Task 05 (Page Templates), but prepare the structure.

## Testing Requirements

### Manual Testing
1. View page on desktop (1024px+) - sidebar visible, no hamburger
2. View page on tablet (768-1023px) - sidebar hidden, hamburger visible
3. View page on mobile (<768px) - sidebar hidden, hamburger visible
4. Click hamburger - sidebar slides in, overlay appears
5. Click overlay - sidebar closes
6. Press Escape - sidebar closes
7. Click sidebar link on mobile - sidebar closes
8. Resize window - sidebar state resets appropriately

### Accessibility Testing
1. Tab through header elements - logical order
2. Hamburger button has aria-label
3. Hamburger button has aria-expanded attribute
4. Focus visible on all interactive elements

## Git Commit

**Files to Stage:**
- `public/css/style.css` (updated)
- `public/js/navigation.js` (new)

**Commit Message:**
```
feat(ui): add responsive layout system

- Add header with logo, channel selector, user menu
- Add collapsible sidebar with navigation
- Add main content area with page structure
- Add mobile navigation with overlay
- Add responsive breakpoints for tablet and mobile
- Add breadcrumb and back link components

Phase 1 Task 02: Layout System
```

## Acceptance Criteria

- [ ] Header displays correctly with all elements
- [ ] Sidebar visible on desktop, hidden on tablet/mobile
- [ ] Hamburger menu appears on tablet/mobile
- [ ] Sidebar slides in when hamburger clicked
- [ ] Overlay appears behind sidebar on mobile
- [ ] Sidebar closes when overlay clicked
- [ ] Sidebar closes when Escape pressed
- [ ] Page content area responsive
- [ ] All interactive elements keyboard accessible
