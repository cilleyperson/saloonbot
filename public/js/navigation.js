/**
 * Mobile Navigation Handler
 * Manages sidebar toggle for tablet/mobile views
 */
(function() {
  'use strict';

  var sidebar = document.querySelector('[data-sidebar]');
  var menuToggle = document.querySelector('.header-menu-toggle');
  var overlay = null;

  if (!sidebar || !menuToggle) return;

  // Create overlay element
  overlay = document.createElement('div');
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
  var sidebarLinks = sidebar.querySelectorAll('.sidebar-link');
  for (var i = 0; i < sidebarLinks.length; i++) {
    sidebarLinks[i].addEventListener('click', function() {
      if (window.innerWidth < 1024) {
        closeSidebar();
      }
    });
  }

  // Handle resize
  var resizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      if (window.innerWidth >= 1024) {
        closeSidebar();
      }
    }, 100);
  });

  // Expose for external use
  window.Navigation = {
    open: openSidebar,
    close: closeSidebar,
    toggle: toggleSidebar
  };
})();
