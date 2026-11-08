/** Repair Ghost's fixed product-card markup without replacing native nodes. */
export function setupContentCards(content) {
  // Keep h4 for native styling/TOC nesting; expose the card as an article section.
  content.querySelectorAll('.kg-product-card h4.kg-product-card-title:not([aria-level]):not([role])').forEach(function(title) {
    title.setAttribute('aria-level', '2');
  });

  content.querySelectorAll('.kg-product-card .kg-product-card-container > img.kg-product-card-image:not([alt]):not([aria-label]):not([aria-labelledby]):not([title]):not([role])').forEach(function(image) {
    var hasSource = ['src', 'srcset', 'data-src', 'data-srcset'].some(function(name) {
      return (image.getAttribute(name) || '').trim();
    });
    var title = image.closest('.kg-product-card').querySelectorAll('.kg-product-card-title')[0];
    var name = title ? title.textContent.trim() : '';
    if (!hasSource) image.setAttribute('alt', '');
    else if (name) image.setAttribute('alt', name);
  });
}
