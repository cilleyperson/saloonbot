/**
 * Toast Notification System
 * Provides non-blocking notifications that auto-dismiss
 */
(function() {
  'use strict';

  var container = null;
  var toastId = 0;
  var TOAST_DURATION = 5000;
  var ANIMATION_DURATION = 300;

  /**
   * Get or create the toast container
   */
  function getContainer() {
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  /**
   * Create an SVG icon element
   */
  function createIcon(type) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('fill', 'currentColor');

    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill-rule', 'evenodd');
    path.setAttribute('clip-rule', 'evenodd');

    var paths = {
      success: 'M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z',
      error: 'M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z',
      warning: 'M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z',
      info: 'M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z'
    };

    path.setAttribute('d', paths[type] || paths.info);
    svg.appendChild(path);

    return svg;
  }

  /**
   * Create and show a toast notification
   * @param {string} message - The message to display
   * @param {string} type - The type: 'success', 'error', 'warning', 'info'
   * @param {number} duration - Optional custom duration in ms
   */
  function show(message, type, duration) {
    type = type || 'info';
    duration = duration || TOAST_DURATION;

    var id = ++toastId;
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    toast.setAttribute('data-toast-id', id);

    // Create icon container
    var iconSpan = document.createElement('span');
    iconSpan.className = 'toast-icon';
    iconSpan.appendChild(createIcon(type));
    toast.appendChild(iconSpan);

    // Create message span (using textContent for safety)
    var messageSpan = document.createElement('span');
    messageSpan.className = 'toast-message';
    messageSpan.textContent = message;
    toast.appendChild(messageSpan);

    // Create close button
    var closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '\u00D7'; // × character
    closeBtn.addEventListener('click', function() {
      dismiss(id);
    });
    toast.appendChild(closeBtn);

    // Add to container
    getContainer().appendChild(toast);

    // Trigger animation
    requestAnimationFrame(function() {
      toast.classList.add('toast-visible');
    });

    // Auto-dismiss
    setTimeout(function() {
      dismiss(id);
    }, duration);

    return id;
  }

  /**
   * Dismiss a toast by ID
   */
  function dismiss(id) {
    var toast = document.querySelector('[data-toast-id="' + id + '"]');
    if (!toast) return;

    toast.classList.remove('toast-visible');
    toast.classList.add('toast-hiding');

    setTimeout(function() {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, ANIMATION_DURATION);
  }

  /**
   * Dismiss all toasts
   */
  function dismissAll() {
    var toasts = document.querySelectorAll('.toast');
    for (var i = 0; i < toasts.length; i++) {
      var id = toasts[i].getAttribute('data-toast-id');
      if (id) {
        dismiss(parseInt(id, 10));
      }
    }
  }

  // Convenience methods
  function success(message, duration) {
    return show(message, 'success', duration);
  }

  function error(message, duration) {
    return show(message, 'error', duration);
  }

  function warning(message, duration) {
    return show(message, 'warning', duration);
  }

  function info(message, duration) {
    return show(message, 'info', duration);
  }

  // Expose globally
  window.Toast = {
    show: show,
    success: success,
    error: error,
    warning: warning,
    info: info,
    dismiss: dismiss,
    dismissAll: dismissAll
  };
})();
