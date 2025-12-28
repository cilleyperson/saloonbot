# Task 03: Component Library

## Task ID
`P1-T03`

## Prerequisites
- Task 01 (CSS Foundation) completed

## Objective
Create reusable UI components including buttons, cards, forms, tables, badges, modals, and toast notifications.

## Agent Type
`frontend-mobile-development:frontend-developer`

## Security Requirements
- Form components must support CSRF token hidden fields
- No JavaScript execution in component templates
- Escape user content in badge/toast displays
- Use safe DOM methods (createElement, textContent) instead of innerHTML

## Implementation Steps

### Step 1: Add Component CSS to style.css

Append the following to `public/css/style.css`:

```css
/* ----------------------------------------
   6. Component Library
   ---------------------------------------- */

/* ---- Buttons ---- */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  font-family: var(--font-primary);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  line-height: var(--leading-tight);
  text-decoration: none;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all var(--transition-fast);
  min-height: 36px;
  white-space: nowrap;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--accent-primary);
  color: white;
  border-color: var(--accent-primary);
}

.btn-primary:hover:not(:disabled) {
  background: var(--accent-primary-hover);
  border-color: var(--accent-primary-hover);
}

.btn-secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border-color: var(--border-primary);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--border-primary);
}

.btn-danger {
  background: var(--status-error);
  color: white;
  border-color: var(--status-error);
}

.btn-danger:hover:not(:disabled) {
  background: #d32f2f;
  border-color: #d32f2f;
}

.btn-success {
  background: var(--status-success);
  color: white;
  border-color: var(--status-success);
}

.btn-success:hover:not(:disabled) {
  background: #00a844;
  border-color: #00a844;
}

.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border-color: transparent;
}

.btn-ghost:hover:not(:disabled) {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.btn-icon {
  padding: var(--space-2);
  min-width: 36px;
}

.btn-sm {
  min-height: 28px;
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-xs);
}

.btn-lg {
  min-height: 44px;
  padding: var(--space-3) var(--space-6);
  font-size: var(--text-base);
}

/* Touch-friendly buttons on mobile */
@media (max-width: 767px) {
  .btn {
    min-height: 44px;
  }
  .btn-sm {
    min-height: 36px;
  }
}

/* ---- Cards ---- */
.card {
  background: var(--bg-elevated);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  transition: background-color var(--transition-normal), border-color var(--transition-normal);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4);
  border-bottom: 1px solid var(--border-primary);
  gap: var(--space-3);
}

.card-title {
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  margin: 0;
}

.card-actions {
  display: flex;
  gap: var(--space-2);
}

.card-body {
  padding: var(--space-4);
}

.card-footer {
  padding: var(--space-4);
  border-top: 1px solid var(--border-primary);
  background: var(--bg-secondary);
  border-radius: 0 0 var(--radius-md) var(--radius-md);
}

/* ---- Form Controls ---- */
.form-group {
  margin-bottom: var(--space-4);
}

.form-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-4);
}

.form-label {
  display: block;
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--text-primary);
  margin-bottom: var(--space-2);
}

.form-label.required::after {
  content: ' *';
  color: var(--status-error);
}

.form-input,
.form-select,
.form-textarea {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-primary);
  font-size: var(--text-base);
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.form-input:focus,
.form-select:focus,
.form-textarea:focus {
  outline: none;
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px rgba(145, 71, 255, 0.15);
}

.form-input::placeholder {
  color: var(--text-tertiary);
}

.form-input.error,
.form-select.error,
.form-textarea.error {
  border-color: var(--status-error);
}

.form-input:disabled,
.form-select:disabled,
.form-textarea:disabled {
  background: var(--bg-tertiary);
  cursor: not-allowed;
  opacity: 0.7;
}

.form-textarea {
  resize: vertical;
  min-height: 100px;
}

.form-help {
  display: block;
  font-size: var(--text-xs);
  color: var(--text-secondary);
  margin-top: var(--space-1);
}

.form-error {
  display: block;
  font-size: var(--text-xs);
  color: var(--status-error);
  margin-top: var(--space-1);
}

/* Input with prefix/suffix */
.input-group {
  display: flex;
  align-items: stretch;
}

.input-prefix,
.input-suffix {
  display: flex;
  align-items: center;
  padding: 0 var(--space-3);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

.input-prefix {
  border-right: none;
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
}

.input-suffix {
  border-left: none;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.input-group .form-input {
  border-radius: 0;
}

.input-group .form-input:first-child {
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
}

.input-group .form-input:last-child {
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

/* Toggle Switch */
.toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  cursor: pointer;
  user-select: none;
}

.toggle-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: relative;
  width: 44px;
  height: 24px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-full);
  transition: background var(--transition-fast);
  flex-shrink: 0;
}

.toggle-slider::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  background: white;
  border-radius: 50%;
  transition: transform var(--transition-fast);
  box-shadow: var(--shadow-sm);
}

.toggle-input:checked + .toggle-slider {
  background: var(--accent-primary);
}

.toggle-input:checked + .toggle-slider::after {
  transform: translateX(20px);
}

.toggle-input:focus-visible + .toggle-slider {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

.toggle-label {
  font-size: var(--text-sm);
  color: var(--text-primary);
}

/* Checkbox */
.checkbox {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  user-select: none;
}

.checkbox-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.checkbox-box {
  width: 18px;
  height: 18px;
  border: 2px solid var(--border-primary);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.checkbox-input:checked + .checkbox-box {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
}

.checkbox-input:checked + .checkbox-box::after {
  content: '';
  width: 5px;
  height: 9px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg) translateY(-1px);
}

.checkbox-input:focus-visible + .checkbox-box {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

.checkbox-label {
  font-size: var(--text-sm);
  color: var(--text-primary);
}

/* Form Actions */
.form-actions {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-6);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border-primary);
}

@media (max-width: 767px) {
  .form-actions {
    flex-direction: column;
  }

  .form-actions .btn {
    width: 100%;
    justify-content: center;
  }
}

/* ---- Tables ---- */
.table-container {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.table th,
.table td {
  padding: var(--space-3) var(--space-4);
  text-align: left;
  border-bottom: 1px solid var(--border-primary);
  vertical-align: middle;
}

.table th {
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  white-space: nowrap;
}

.table tbody tr {
  transition: background-color var(--transition-fast);
}

.table tbody tr:hover {
  background: var(--bg-secondary);
}

.table-actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
}

/* Inline form in table */
.inline-form {
  display: inline;
}

/* Responsive table (stack on mobile) */
@media (max-width: 767px) {
  .table-responsive-stack thead {
    display: none;
  }

  .table-responsive-stack tbody tr {
    display: block;
    padding: var(--space-4);
    border-bottom: 1px solid var(--border-primary);
  }

  .table-responsive-stack tbody td {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-2) 0;
    border: none;
  }

  .table-responsive-stack tbody td::before {
    content: attr(data-label);
    font-weight: var(--font-medium);
    color: var(--text-secondary);
    margin-right: var(--space-3);
  }

  .table-responsive-stack .table-actions {
    justify-content: flex-start;
    padding-top: var(--space-2);
    border-top: 1px solid var(--border-primary);
    margin-top: var(--space-2);
  }
}

/* ---- Badges ---- */
.badge {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  border-radius: var(--radius-full);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.badge-success,
.status-connected {
  background: var(--status-success-bg);
  color: var(--status-success);
}

.badge-error,
.status-disconnected {
  background: var(--status-error-bg);
  color: var(--status-error);
}

.badge-warning {
  background: var(--status-warning-bg);
  color: var(--status-warning);
}

.badge-info {
  background: var(--status-info-bg);
  color: var(--status-info);
}

/* ---- Modals ---- */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  z-index: 1000;
  opacity: 0;
  visibility: hidden;
  transition: opacity var(--transition-normal), visibility var(--transition-normal);
}

.modal-overlay.active {
  opacity: 1;
  visibility: visible;
}

.modal {
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  max-width: 480px;
  width: 100%;
  max-height: 90vh;
  overflow: auto;
  transform: scale(0.95);
  transition: transform var(--transition-normal);
}

.modal-overlay.active .modal {
  transform: scale(1);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4);
  border-bottom: 1px solid var(--border-primary);
}

.modal-title {
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--space-1);
  color: var(--text-secondary);
  transition: color var(--transition-fast);
}

.modal-close:hover {
  color: var(--text-primary);
}

.modal-body {
  padding: var(--space-4);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  padding: var(--space-4);
  border-top: 1px solid var(--border-primary);
}

@media (max-width: 767px) {
  .modal {
    max-width: 100%;
    margin: var(--space-4);
  }
}

/* ---- Toast Notifications ---- */
.toast-container {
  position: fixed;
  bottom: var(--space-4);
  right: var(--space-4);
  z-index: 1100;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--bg-elevated);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  border-left: 4px solid var(--border-primary);
  min-width: 300px;
  max-width: 400px;
  animation: toastSlideIn 0.3s ease;
  pointer-events: auto;
}

.toast-success { border-left-color: var(--status-success); }
.toast-error { border-left-color: var(--status-error); }
.toast-warning { border-left-color: var(--status-warning); }
.toast-info { border-left-color: var(--status-info); }

.toast-message {
  flex: 1;
  font-size: var(--text-sm);
  color: var(--text-primary);
  margin: 0;
}

.toast-close {
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--space-1);
  color: var(--text-tertiary);
}

.toast-close:hover {
  color: var(--text-primary);
}

@keyframes toastSlideIn {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes toastSlideOut {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(100%);
  }
}

.toast.removing {
  animation: toastSlideOut 0.3s ease forwards;
}

@media (max-width: 767px) {
  .toast-container {
    left: var(--space-4);
    right: var(--space-4);
    bottom: var(--space-4);
  }

  .toast {
    min-width: auto;
    max-width: 100%;
  }
}

/* ---- Alert/Flash Messages ---- */
.alert {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-4);
  font-size: var(--text-sm);
}

.alert-success {
  background: var(--status-success-bg);
  color: var(--status-success);
  border: 1px solid var(--status-success);
}

.alert-error {
  background: var(--status-error-bg);
  color: var(--status-error);
  border: 1px solid var(--status-error);
}

.alert-warning {
  background: var(--status-warning-bg);
  color: var(--status-warning);
  border: 1px solid var(--status-warning);
}

.alert-info {
  background: var(--status-info-bg);
  color: var(--status-info);
  border: 1px solid var(--status-info);
}

/* ---- Empty State ---- */
.empty-state {
  text-align: center;
  padding: var(--space-12) var(--space-4);
  color: var(--text-secondary);
}

.empty-state-icon {
  font-size: 3rem;
  margin-bottom: var(--space-4);
  opacity: 0.5;
}

.empty-state-title {
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  margin-bottom: var(--space-2);
}

.empty-state-description {
  margin-bottom: var(--space-4);
}

/* ---- Stats Cards ---- */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.stat-card {
  background: var(--bg-elevated);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  background: var(--bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.stat-icon svg {
  width: 24px;
  height: 24px;
  color: var(--text-secondary);
}

.stat-icon-success {
  background: var(--status-success-bg);
}

.stat-icon-success svg {
  color: var(--status-success);
}

.stat-content {
  min-width: 0;
}

.stat-value {
  display: block;
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  color: var(--text-primary);
  line-height: 1.2;
}

.stat-label {
  display: block;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

/* ---- Loading Spinner ---- */
.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--bg-tertiary);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

[data-theme="dark"] .loading-overlay {
  background: rgba(0, 0, 0, 0.8);
}
```

### Step 2: Create Toast JavaScript (Using Safe DOM Methods)

Create `public/js/toast.js`:

```javascript
/**
 * Toast Notification System
 * Uses safe DOM methods - no innerHTML for security
 */
(function() {
  'use strict';

  var TOAST_DURATION = 5000;
  var container = null;

  function getContainer() {
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      container.setAttribute('aria-live', 'polite');
      container.setAttribute('aria-label', 'Notifications');
      document.body.appendChild(container);
    }
    return container;
  }

  function createCloseIcon() {
    // Create SVG using DOM methods for security
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('fill', 'currentColor');

    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z');
    svg.appendChild(path);

    return svg;
  }

  function createToast(message, type) {
    type = type || 'info';

    // Create toast container
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;

    // Create message element (using textContent for XSS safety)
    var messageEl = document.createElement('p');
    messageEl.className = 'toast-message';
    messageEl.textContent = message;
    toast.appendChild(messageEl);

    // Create close button
    var closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.setAttribute('aria-label', 'Dismiss notification');
    closeBtn.appendChild(createCloseIcon());
    toast.appendChild(closeBtn);

    // Add click handler for close
    closeBtn.addEventListener('click', function() {
      removeToast(toast);
    });

    // Add to container
    getContainer().appendChild(toast);

    // Auto-remove after duration
    setTimeout(function() {
      if (toast.parentNode) {
        removeToast(toast);
      }
    }, TOAST_DURATION);

    return toast;
  }

  function removeToast(toast) {
    toast.classList.add('removing');
    setTimeout(function() {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }

  // Expose globally
  window.Toast = {
    show: function(message, type) {
      return createToast(message, type);
    },
    success: function(message) {
      return createToast(message, 'success');
    },
    error: function(message) {
      return createToast(message, 'error');
    },
    warning: function(message) {
      return createToast(message, 'warning');
    },
    info: function(message) {
      return createToast(message, 'info');
    }
  };
})();
```

## Testing Requirements

### Manual Testing
1. Verify all button variants display correctly
2. Test buttons in all states (hover, active, disabled)
3. Test form inputs, selects, textareas
4. Test toggle switches and checkboxes
5. Test table display and responsive stacking
6. Test badges in all color variants
7. Test modal open/close functionality
8. Test toast notifications (show, auto-dismiss, manual dismiss)

### Security Testing
1. Verify toast messages are escaped (try XSS payloads in message)
2. Verify no innerHTML usage in JavaScript
3. Verify form inputs don't execute JavaScript

### Accessibility Testing
1. All form controls have visible labels
2. Toggle and checkbox have keyboard support
3. Modal traps focus when open
4. Toast announcements are accessible
5. Contrast ratios meet WCAG 2.1 AA

## Git Commit

**Files to Stage:**
- `public/css/style.css` (updated)
- `public/js/toast.js` (new)

**Commit Message:**
```
feat(ui): add component library

- Add button component (primary, secondary, danger, success, ghost)
- Add card component with header, body, footer
- Add form controls (input, select, textarea, toggle, checkbox)
- Add table component with responsive stacking
- Add badge component with status variants
- Add modal component with overlay
- Add toast notification system (using safe DOM methods)
- Add alert/flash message styles
- Add empty state component
- Add stats card grid
- Add loading spinner

Security: Uses textContent and createElement instead of innerHTML
Phase 1 Task 03: Component Library
```

## Acceptance Criteria

- [ ] All button variants styled correctly
- [ ] Form controls consistent across browsers
- [ ] Toggle switch animates smoothly
- [ ] Table stacks on mobile with data labels
- [ ] Badges display all color variants
- [ ] Modal opens and closes with animation
- [ ] Toast notifications auto-dismiss
- [ ] Toast uses safe DOM methods (no innerHTML)
- [ ] All components theme-aware (use CSS variables)
- [ ] All components keyboard accessible
