/**
 * Mobile Navigation Handler
 * Manages sidebar toggle for tablet/mobile views
 */
(function() {
  'use strict';

  var sidebar = null;
  var menuToggle = null;
  var overlay = null;

  function init() {
    sidebar = document.querySelector('[data-sidebar]');
    menuToggle = document.querySelector('.header-menu-toggle');

    // Exit if elements don't exist (e.g., user not logged in)
    if (!sidebar || !menuToggle) {
      return;
    }

    // Create overlay element for mobile
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);

    // Event listeners
    menuToggle.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      toggleSidebar();
    });

    overlay.addEventListener('click', closeSidebar);

    // Close on escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && sidebar.classList.contains('open')) {
        closeSidebar();
      }
    });

    // Close sidebar when clicking a link (for mobile)
    var sidebarLinks = sidebar.querySelectorAll('.sidebar-link');
    for (var i = 0; i < sidebarLinks.length; i++) {
      sidebarLinks[i].addEventListener('click', function() {
        if (window.innerWidth < 1024) {
          closeSidebar();
        }
      });
    }

    // Handle resize - close sidebar when switching to desktop
    var resizeTimer;
    window.addEventListener('resize', function() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function() {
        if (window.innerWidth >= 1024 && sidebar.classList.contains('open')) {
          closeSidebar();
        }
      }, 100);
    });
  }

  function openSidebar() {
    if (!sidebar || !overlay) return;
    sidebar.classList.add('open');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (menuToggle) {
      menuToggle.setAttribute('aria-expanded', 'true');
    }
  }

  function closeSidebar() {
    if (!sidebar || !overlay) return;
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    if (menuToggle) {
      menuToggle.setAttribute('aria-expanded', 'false');
    }
  }

  function toggleSidebar() {
    if (!sidebar) return;
    if (sidebar.classList.contains('open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for external use
  window.Navigation = {
    open: openSidebar,
    close: closeSidebar,
    toggle: toggleSidebar
  };
})();
