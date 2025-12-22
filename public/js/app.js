/**
 * Saloon Bot - Client-side JavaScript
 */

(function() {
  'use strict';

  // Auto-dismiss alerts after 5 seconds
  document.querySelectorAll('.alert').forEach(function(alert) {
    setTimeout(function() {
      alert.style.transition = 'opacity 0.3s ease';
      alert.style.opacity = '0';
      setTimeout(function() {
        alert.remove();
      }, 300);
    }, 5000);
  });

  // Confirm dialogs for delete actions
  document.querySelectorAll('form[action*="delete"]').forEach(function(form) {
    form.addEventListener('submit', function(e) {
      if (!confirm('Are you sure you want to delete this? This action cannot be undone.')) {
        e.preventDefault();
      }
    });
  });

  // Form validation
  document.querySelectorAll('form').forEach(function(form) {
    form.addEventListener('submit', function(e) {
      const requiredFields = form.querySelectorAll('[required]');
      let isValid = true;

      requiredFields.forEach(function(field) {
        if (!field.value.trim()) {
          isValid = false;
          field.classList.add('error');
        } else {
          field.classList.remove('error');
        }
      });

      if (!isValid) {
        e.preventDefault();
        alert('Please fill in all required fields.');
      }
    });
  });

  // Preview template output
  function updatePreview(templateInput, previewElement, sampleData) {
    const template = templateInput.value;
    let preview = template;

    Object.keys(sampleData).forEach(function(key) {
      const regex = new RegExp('\\{' + key + '\\}', 'g');
      preview = preview.replace(regex, sampleData[key]);
    });

    previewElement.textContent = preview;
  }

  // Log initialization
  console.log('Saloon Bot Admin UI loaded');
})();
