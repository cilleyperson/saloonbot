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
