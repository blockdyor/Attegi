/** Use native layout sizing without replacing Ghost's original sources or fallback. */
export function setupContentImages(postContent) {
  var images = postContent.querySelectorAll('.kg-image-card img.kg-image[loading="lazy"][srcset]');
  Array.prototype.forEach.call(images, function(img) {
    // shortcut: only still-unselected lazy images; parser-started requests need an HTML-side fix.
    if (img.currentSrc || img.complete || !img.getAttribute('srcset').trim()) return;
    // Auto sizing applies containment; retain existing layout for cards without intrinsic dimensions.
    if (!['width', 'height'].every(function(name) {
      var value = img.getAttribute(name);
      return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
    })) return;

    var sizes = img.getAttribute('sizes') || '100vw';
    if (/^\s*auto(?:\s*,|\s*$)/i.test(sizes)) return;
    img.setAttribute('sizes', 'auto, ' + sizes);
  });
}
