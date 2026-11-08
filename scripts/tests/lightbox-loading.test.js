const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const Handlebars = require('handlebars');

const root = process.env.THEME_ROOT || path.resolve(__dirname, '../..');
const template = fs.readFileSync(path.join(root, 'default.hbs'), 'utf8');
const match = template.match(/<script([^>]*)>\s*(\/\/ Conditionally load GLightbox[\s\S]*?)<\/script>/);
const source = match[2];
const hbs = Handlebars.create();
hbs.registerHelper('asset', name => new hbs.SafeString(`/assets/${name}?v=release-fixture`));
const script = hbs.compile(source)({});
const attributes = hbs.compile(match[1])({});

function setup(hasImages = true, prefix = '') {
  const styles = [];
  const scripts = [];
  const calls = [];
  // An already linked native card keeps its existing destination.
  const image = {closest: () => ({href: '/original-image.webp'})};
  const context = {
    document: {
      currentScript: {getAttribute: name => prefix + attributes.match(new RegExp(`${name}="([^"]+)"`))[1]},
      readyState: 'complete',
      querySelectorAll: () => hasImages ? [image] : [],
      createElement: tag => ({tagName: tag.toUpperCase()}),
      head: {appendChild: node => styles.push(node)},
      body: {getAttribute: () => 'Open image', appendChild: node => scripts.push(node)},
    },
  };
  vm.runInNewContext(script, context);
  return {styles, scripts, calls, context, loadScript() {
    context.GLightbox = options => {calls.push(options); return {};};
    scripts[0].onload();
  }};
}

test('pages without lightbox images do not load lightbox assets', () => {
  const state = setup(false);
  assert.equal(state.styles.length, 0);
  assert.equal(state.scripts.length, 0);
});

test('lightbox CSS is non-blocking until loaded and uses versioned theme assets', () => {
  const state = setup();
  assert.equal(state.styles[0].media, 'print');
  assert.equal(state.styles[0].href, '/assets/css/glightbox.min.css?v=release-fixture');
  assert.equal(state.scripts[0].src, '/assets/js/glightbox.min.js?v=release-fixture');
  assert.equal(typeof state.styles[0].onload, 'function');
});

test('a fast lightbox script cannot open an unstyled modal before CSS is ready', () => {
  const state = setup();
  state.loadScript();
  assert.equal(state.calls.length, 0);
  assert.equal(typeof state.styles[0].onload, 'function');
  state.styles[0].onload();
  assert.equal(state.styles[0].media, 'all');
  assert.equal(state.calls.length, 1);
  assert.equal(state.calls[0].selector, '.glightbox');
  assert.equal(state.calls[0].zoomable, true);
  assert.equal(state.calls[0].touchNavigation, true);
});

test('CSS arriving before the script initializes the same gallery exactly once', () => {
  const state = setup();
  assert.equal(typeof state.styles[0].onload, 'function');
  state.styles[0].onload();
  assert.equal(state.calls.length, 0);
  state.loadScript();
  state.scripts[0].onload();
  state.styles[0].onload();
  assert.equal(state.calls.length, 1);
});

test('failed CSS keeps existing image links usable instead of binding an unstyled modal', () => {
  const state = setup();
  state.loadScript();
  assert.equal(state.calls.length, 0, 'Native image links remain the fallback while styles are unavailable');
});

test('the shared site script is deferred rather than blocking the document parser', () => {
  const tag = template.match(/<script\b[^>]*src="{{asset "js\/site\.js"}}"[^>]*>/)[0];
  assert.match(tag, /\bdefer\b/);
});

test('a quoted site subdirectory stays data rather than executable script source', () => {
  const state = setup(true, "/blog'quoted");
  assert.equal(state.styles[0].href, "/blog'quoted/assets/css/glightbox.min.css?v=release-fixture");
});
