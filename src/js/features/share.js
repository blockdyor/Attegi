/**
 * Share Feature
 * Native Web Share API integration
 */

import { doc, qsa } from '../core/index.js';

/**
 * Initialize native share button
 */
export function setupShare() {
  var shareButton = doc.getElementById('share-button');
  var nativeShare = doc.querySelector('.js-share-native');
  var defaultShare = doc.querySelector('.js-share-default');
  if (!shareButton || !nativeShare || !defaultShare ||
      nativeShare.getAttribute('data-share-preference') !== 'Native' ||
      shareButton.getAttribute('data-share-ready') === 'true') return;

  function showFallback(focus) {
    nativeShare.hidden = true;
    defaultShare.hidden = false;
    var firstLink = defaultShare.querySelector('a');
    if (focus && firstLink) firstLink.focus();
  }

  var data = {title: doc.title, url: window.location.href};
  try {
    if (typeof navigator.share !== 'function' ||
        (typeof navigator.canShare === 'function' && !navigator.canShare(data))) {
      showFallback(false);
      return;
    }
  } catch {
    showFallback(false);
    return;
  }

  shareButton.addEventListener('click', async function(event) {
    event.preventDefault();
    if (shareButton.disabled) return;
    shareButton.disabled = true;
    try {
      await navigator.share(data);
    } catch {
      // AbortError also covers missing share targets, not only cancellation.
      showFallback(true);
    } finally {
      shareButton.disabled = false;
    }
  });
  shareButton.setAttribute('data-share-ready', 'true');
  nativeShare.hidden = false;
  defaultShare.hidden = true;
}

/**
 * Open the default (Twitter/Facebook/LinkedIn) share links in a popup
 * window instead of a full navigation. Delegated via a click listener
 * rather than inline `onclick` attributes, which a strict CSP would block.
 */
export function setupSharePopups() {
  var links = qsa('.js-share-popup');
  if (!links.length) return;

  Array.prototype.forEach.call(links, function(link) {
    if (link.getAttribute('data-share-popup-ready') === 'true') return;
    link.addEventListener('click', function(event) {
      var size = (link.dataset.popupSize || '600,400').split(',');
      try {
        var popup = window.open(link.href, 'share-popup', 'width=' + size[0] + ',height=' + size[1]);
        if (popup) {
          popup.opener = null;
          event.preventDefault();
        }
      } catch {
        // A denied popup must retain the anchor's ordinary navigation.
      }
    });
    link.setAttribute('data-share-popup-ready', 'true');
  });
}
