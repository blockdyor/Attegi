const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const {buildSync} = require('esbuild');
const {Element, Text} = require('domhandler');
const {selectAll, selectOne} = require('css-select');

const root = path.resolve(__dirname, '../..');
const feature = path.join(root, 'src/js/features/content-images.js');
// Before the feature exists, exercise the actual current portrait-image setup.
const entry = fs.existsSync(feature)
  ? "export {setupContentImages as setup} from './src/js/features/content-images.js';"
  : "import {setupPortraitImages} from './src/js/features/portrait-media.js'; export function setup() { setupPortraitImages(); }";
const source = buildSync({stdin: {contents: entry, resolveDir: root}, bundle: true,
  format: 'cjs', platform: 'browser', write: false}).outputFiles[0].text;

// Real installed DOM nodes and CSS selectors, with only the browser attribute API adapted.
function element(name, attributes = {}, children = []) {
  const node = new Element(name, {...attributes}, children);
  children.forEach(child => { child.parent = node; });
  node.getAttribute = key => node.attribs[key] ?? null;
  node.setAttribute = (key, value) => { node.attribs[key] = value; };
  node.querySelectorAll = selector => selectAll(selector, node.children);
  node.querySelector = selector => selectOne(selector, node.children);
  node.classList = {add(name) { node.attribs.class = `${node.attribs.class || ''} ${name}`.trim(); }};
  node.currentSrc = '';
  node.complete = false;
  const events = new EventTarget();
  node.addEventListener = events.addEventListener.bind(events);
  return node;
}

function image(attributes = {}) {
  return element('img', {
    class: 'kg-image', loading: 'lazy', width: '1000', height: '750',
    src: 'https://blockdyor.com/content/images/2026/02/COLDCARD-Q-Front.webp',
    srcset: 'https://blockdyor.com/content/images/size/w600/2026/02/COLDCARD-Q-Front.webp 600w, https://blockdyor.com/content/images/2026/02/COLDCARD-Q-Front.webp 1000w',
    sizes: '(min-width: 720px) 720px', alt: 'COLDCARD Q Front', ...attributes
  });
}
function card(img) {
  return element('figure', {class: 'kg-card kg-image-card kg-card-hascaption'}, [img]);
}
function setup(children) {
  const content = element('div', {class: 'post-content'}, children);
  const document = element('main', {}, [content]);
  document.documentElement = document;
  const module = {exports: {}};
  vm.runInNewContext(source, {module, exports: module.exports, document});
  return {content, run: () => module.exports.setup(content)};
}

test('pending native lazy cards use actual layout sizing and keep the original fallback', () => {
  const front = image();
  const overview = image({width: '1920', height: '1080', alt: 'COLDCARD Q Overview',
    src: 'https://blockdyor.com/content/images/2026/02/COLDCARD-Q-Overview.webp',
    srcset: 'https://blockdyor.com/content/images/size/w600/2026/02/COLDCARD-Q-Overview.webp 600w, https://blockdyor.com/content/images/size/w1000/2026/02/COLDCARD-Q-Overview.webp 1000w, https://blockdyor.com/content/images/size/w1600/2026/02/COLDCARD-Q-Overview.webp 1600w, https://blockdyor.com/content/images/2026/02/COLDCARD-Q-Overview.webp 1920w'});
  const before = [front, overview].map(img => ({...img.attribs}));
  setup([card(front), card(overview)]).run();
  for (const [index, img] of [front, overview].entries()) {
    assert.deepEqual(img.attribs, {...before[index], sizes: 'auto, (min-width: 720px) 720px'});
  }
});

test('missing sizes retains the standard 100vw fallback and repeated activation is harmless', () => {
  const img = image();
  delete img.attribs.sizes;
  const state = setup([card(img)]);
  state.run(); state.run();
  assert.equal(img.getAttribute('sizes'), 'auto, 100vw');
});

test('already-auto fallback lists are preserved byte for byte', () => {
  const img = image({sizes: ' AUTO , (min-width: 720px) 720px, 100vw'});
  setup([card(img)]).run();
  assert.equal(img.getAttribute('sizes'), ' AUTO , (min-width: 720px) 720px, 100vw');
});

test('eager, non-responsive, gallery and non-content images are untouched', () => {
  const eager = image({loading: 'eager'});
  const noCandidates = image({srcset: ''});
  const gallery = image();
  const outside = image();
  const state = setup([card(eager), card(noCandidates), element('figure', {class: 'kg-gallery-card'}, [gallery])]);
  state.content.parent.children.push(card(outside));
  state.run();
  for (const img of [eager, noCandidates, gallery, outside]) {
    assert.equal(img.getAttribute('sizes'), '(min-width: 720px) 720px');
  }
});

test('images without reliable intrinsic dimensions avoid auto-size containment changes', () => {
  for (const attributes of [{width: ''}, {height: ''}, {width: '0'}, {height: '-1'}, {width: '100%'},
    {width: 'Infinity'}, {height: '1.5'}, {width: '0x10'}, {height: '1e3'},
    {width: String(Number.MAX_SAFE_INTEGER + 1)}]) {
    const img = image(attributes);
    setup([card(img)]).run();
    assert.equal(img.getAttribute('sizes'), '(min-width: 720px) 720px');
  }
});

test('already selected or complete images are not reselected by late activation', () => {
  const selected = image(); selected.currentSrc = selected.getAttribute('src');
  const complete = image(); complete.complete = true;
  setup([card(selected), card(complete)]).run();
  assert.equal(selected.getAttribute('sizes'), '(min-width: 720px) 720px');
  assert.equal(complete.getAttribute('sizes'), '(min-width: 720px) 720px');
});

test('original links, captions, alt text, and portrait dimensions stay intact', () => {
  const img = image({width: '750', height: '1000'});
  const link = element('a', {href: img.getAttribute('src')}, [img]);
  const caption = element('figcaption', {}, [new Text('Original caption')]);
  const figure = card(link); figure.children.push(caption); caption.parent = figure;
  const before = {...img.attribs};
  setup([figure]).run();
  assert.deepEqual(img.attribs, {...before, sizes: 'auto, (min-width: 720px) 720px'});
  assert.equal(link.getAttribute('href'), before.src);
  assert.equal(caption.children[0].data, 'Original caption');
  assert.equal(img.parent, link);
});

test('empty content is safe', () => {
  setup([]).run();
});
