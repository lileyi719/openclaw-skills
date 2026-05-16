/**
 * Workday Element Extractor
 * Run this inside browser.evaluate to discover form elements.
 */
(() => {
  const elements = {};
  
  // Find text inputs and textareas by label or placeholder
  document.querySelectorAll('input, textarea, select').forEach(el => {
    let label = '';
    if (el.id) {
      const labelEl = document.querySelector(`label[for="${el.id}"]`);
      if (labelEl) label = labelEl.innerText;
    }
    if (!label) label = el.getAttribute('aria-label') || el.placeholder || el.name;
    
    if (label) {
      elements[label.trim()] = {
        id: el.id,
        name: el.name,
        type: el.type,
        tagName: el.tagName,
        ariaLabel: el.getAttribute('aria-label')
      };
    }
  });

  return elements;
})();
