const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const {Element, Text} = require('domhandler');
const {selectAll, is} = require('css-select');
const {appendChild, prepend, textContent} = require('domutils');
const {default: serialize} = require('dom-serializer');

const root = process.env.THEME_ROOT || path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'src/js/features/embeds.js'), 'utf8');

// Real selector/tree operations with only the DOM API surface adapted for Node.
// This suite cannot measure browser navigation, requests, cookies or playback.
function element(name, attribs = {}, children = []) {
  const node = new Element(name, {...attribs});
  node.style = {};
  node.querySelectorAll = selector => selectAll(selector, node.children);
  node.getAttribute = name => node.attribs[name] ?? null;
  node.hasAttribute = name => Object.hasOwn(node.attribs, name);
  node.setAttribute = (name, value) => {node.attribs[name] = value;};
  node.closest = selector => {
    for (let current = node; current; current = current.parent) {
      if (current.type === 'tag' && is(current, selector)) return current;
    }
    return null;
  };
  node.appendChild = child => appendChild(node, child);
  node.insertBefore = (child, reference) => prepend(reference, child);
  node.listeners = new Map();
  node.addEventListener = (name, listener) => node.listeners.set(name, listener);
  node.removeEventListener = name => node.listeners.delete(name);
  Object.defineProperties(node, {
    parentNode: {get: () => node.parent},
    tagName: {get: () => node.name.toUpperCase()},
    className: {get: () => node.attribs.class || '', set: value => {node.attribs.class = value;}}
  });
  children.forEach(child => appendChild(node, child));
  return node;
}

function wrap(container) {
  const context = {doc: {createElement: name => element(name)}};
  vm.runInNewContext(source.replace(/^import .*;\n/gm, '').replace('export function ', 'function '), context);
  context.wrapEmbeds(container);
}

const nativeAttributes = {
  width: '200', height: '113', title: 'COLDCARD Q Review', frameborder: '0',
  allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
  referrerpolicy: 'strict-origin-when-cross-origin', allowfullscreen: ''
};

function fixture(src, extra = {}) {
  const frame = element('iframe', {...nativeAttributes, src, ...extra});
  const caption = element('figcaption', {}, [new Text('Original editorial caption')]);
  const figure = element('figure', {class: 'kg-card kg-embed-card'}, [frame, caption]);
  const ad = element('script', {'data-ad': 'keep'}, [new Text('window.inlineAdWasParsed = true;')]);
  const container = element('section', {}, [figure, ad]);
  return {frame, caption, figure, ad, container};
}

test('the actual nocookie DOM player retains its attributes and intrinsic ratio when wrapped', () => {
  const state = fixture('https://www.youtube-nocookie.com/embed/JjNuCHE4EGE?feature=oembed');
  const attributes = {...state.frame.attribs};
  const ad = serialize(state.ad);
  wrap(state.container);
  assert.equal(state.frame.parent.className, 'js-reframe');
  assert.equal(state.frame.parent.style.aspectRatio, '200 / 113');
  assert.deepEqual(state.frame.attribs, attributes);
  assert.equal(state.figure.children[1], state.caption);
  assert.equal(textContent(state.caption), 'Original editorial caption');
  assert.equal(serialize(state.ad), ad);
  assert.equal(state.container.children[1], state.ad, 'Do not inert, clone or rewrite article/ad content');
  const wrapper = state.frame.parent;
  wrap(state.container);
  assert.equal(state.frame.parent, wrapper, 'Repeated activation must not nest wrappers');
});

for (const src of [
  'https://www.youtube.com/embed/JjNuCHE4EGE?feature=oembed&start=42&list=PL_test&origin=https%3A%2F%2Fblockdyor.com#t=5',
  '//www.youtube.com/embed/JjNuCHE4EGE?feature=oembed&controls=0',
  'https://youtube.com/embed/JjNuCHE4EGE?cc_load_policy=1&hl=it'
]) {
  test(`existing privacy-domain conversion preserves every path/query/fragment byte: ${src}`, () => {
    const state = fixture(src);
    wrap(state.container);
    assert.equal(state.frame.getAttribute('src'), src.replace('youtube.com', 'youtube-nocookie.com'));
    assert.deepEqual({...state.frame.attribs, src}, {...nativeAttributes, src});
  });
}

for (const src of [
  'https://notyoutube.com/embed/JjNuCHE4EGE',
  'https://youtube.com.evil.example/embed/JjNuCHE4EGE',
  'https://example.com/path/youtube.com/embed/JjNuCHE4EGE',
  'https://player.vimeo.com/video/123?next=https://youtube.com/embed/JjNuCHE4EGE',
  'https://www.youtube.com/watch?v=JjNuCHE4EGE&next=https://youtube.com/embed/other',
  'https://player.spotify.com/embed/123',
  'https://w.soundcloud.com/player/?url=original',
  'https://player.bilibili.com/player.html?bvid=original'
]) {
  test(`wrapping never rewrites a lookalike host, non-embed path or another provider's query: ${src}`, () => {
    const state = fixture(src);
    wrap(state.container);
    assert.equal(state.frame.getAttribute('src'), src);
  });
}

test('an editor-authored srcdoc boundary and its legacy fallback URL are not modified at runtime', () => {
  const state = fixture('https://www.youtube.com/embed/JjNuCHE4EGE?feature=oembed', {
    srcdoc: '<a href="https://www.youtube-nocookie.com/embed/JjNuCHE4EGE?feature=oembed">Load COLDCARD Q Review video</a>'
  });
  const attributes = {...state.frame.attribs};
  wrap(state.container);
  assert.deepEqual(state.frame.attribs, attributes);
  assert.equal(state.frame.parent.className, 'js-reframe');
});

test('native Ghost video cards are not wrapped or intercepted', () => {
  const video = element('video', {src: '/original.mp4', controls: '', poster: '/original.webp'});
  const card = element('figure', {class: 'kg-card kg-video-card'}, [video]);
  const container = element('section', {}, [card]);
  const before = serialize(container);
  wrap(container);
  assert.equal(serialize(container), before);
  assert.equal(video.parent, card);
  assert.equal(video.listeners.size, 0);
});

test('ordinary video metadata still determines aspect ratio without changing playback attributes', () => {
  const video = element('video', {src: '/original.mp4', controls: '', poster: '/original.webp'});
  const container = element('section', {}, [video]);
  const attributes = {...video.attribs};
  wrap(container);
  video.videoWidth = 1080;
  video.videoHeight = 1920;
  video.listeners.get('loadedmetadata')();
  assert.equal(video.parent.style.aspectRatio, '1080 / 1920');
  assert.deepEqual(video.attribs, attributes);
  assert.equal(video.listeners.size, 0);
});
