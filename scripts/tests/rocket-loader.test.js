const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const root = process.env.THEME_ROOT || path.resolve(__dirname, '../..');

function pendingPoem() {
  const classes = new Set();
  const quote = {textContent: '[!poem] Title\nVerse', classList: {add: c => classes.add(c), remove: c => classes.delete(c)}};
  const listeners = new Map();
  const document = {
    querySelectorAll: selector => {assert.equal(selector, '.post-content blockquote'); return [quote];},
    addEventListener: (type, fn, capture) => {const handlers = listeners.get(type) || []; handlers.push({fn, capture}); listeners.set(type, handlers);},
    removeEventListener: (type, fn) => {listeners.set(type, (listeners.get(type) || []).filter(h => h.fn !== fn));}
  };
  const partial = fs.readFileSync(path.join(root, 'partials/poem-pending.hbs'), 'utf8');
  const source = partial.match(/<script data-cfasync="false">([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(source, {document});
  function dispatch(type, target = document) {
    for (const {fn, capture} of [...(listeners.get(type) || [])]) {
      if (target !== document) assert.equal(capture, true, 'Resource events do not bubble: observe them in capture phase');
      fn({type, target});
    }
  }
  return {hidden: () => classes.has('kg-poem-pending'), dispatch};
}
function script(attrs = {}) {return {tagName: 'SCRIPT', hasAttribute: key => Object.hasOwn(attrs, key)};}

test('native DOMContentLoaded does not expose raw poems before delayed loader replay', () => {
  const state = pendingPoem(); assert.equal(state.hidden(), true);
  state.dispatch('DOMContentLoaded'); assert.equal(state.hidden(), true);
});
for (const type of ['load', 'error']) {
  test(`the theme bundle ${type} releases unconverted poem text`, () => {
    const state = pendingPoem(); state.dispatch(type, script({'data-highlight': '/assets/js/highlight.pack.js'}));
    assert.equal(state.hidden(), false);
    state.dispatch('DOMContentLoaded'); assert.equal(state.hidden(), false);
  });
}
test('a blocked Rocket Loader activator reveals original text rather than hiding it permanently', () => {
  const state = pendingPoem(); state.dispatch('error', script({'data-cf-settings': 'controlled-nonce|0'}));
  assert.equal(state.hidden(), false);
});
test('unrelated resource events do not reveal pending poems', () => {
  const state = pendingPoem();
  for (const type of ['load', 'error']) {
    state.dispatch(type, script());
    state.dispatch(type, {tagName: 'IMG', hasAttribute: () => true});
  }
  state.dispatch('load', script({'data-cf-settings': 'controlled-nonce|0'}));
  assert.equal(state.hidden(), true);
});
test('both deferred article entry tags retain the completion marker used by the fallback', () => {
  for (const name of ['post.hbs', 'page.hbs']) {
    const source = fs.readFileSync(path.join(root, name), 'utf8');
    assert.match(source, /<script defer src="\{\{asset "js\/(?:post|page)\.js"\}\}" data-highlight="\{\{asset "js\/highlight\.pack\.js"\}\}"><\/script>/);
    assert.ok(source.includes('{{> "poem-pending"}}'));
  }
});
