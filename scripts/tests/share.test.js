const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const Handlebars = require('handlebars');
const {Element} = require('domhandler');
const {selectOne, selectAll} = require('css-select');

const root = process.env.THEME_ROOT || path.resolve(__dirname, '../..');
function setup(mode = 'Native', navigator = {}, open = () => null) {
  const hbs = Handlebars.create();
  hbs.registerHelper('t', key => key);
  hbs.registerHelper('encode', value => encodeURIComponent(value));
  hbs.registerHelper('url', () => 'https://example.test/article/');
  hbs.registerHelper('match', function(value, operator, expected, options) {
    assert.equal(operator, '=');
    return value === expected ? options.fn(this) : options.inverse(this);
  });
  for (const name of ['share', 'x', 'facebook', 'linkedin', 'mail']) hbs.registerPartial(`icons/icon-${name}`, fs.readFileSync(path.join(root, `partials/icons/icon-${name}.hbs`), 'utf8'));
  const template = fs.readFileSync(path.join(root, 'post.hbs'), 'utf8').match(/<div class="post-share js-share-native"[\s\S]*?<\/div>\s*<div class="post-share js-share-default"[\s\S]*?<\/div>/)[0];
  const html = hbs.compile(template)({title: 'Title & text'}, {data: {custom: {post_share: mode}}});
  // Adapt the two known rendered groups, not arbitrary article HTML. Real-browser
  // verification separately exercises the complete rendered article and bundle.
  const nativeAttrs = html.match(/<div class="post-share js-share-native"([^>]*)>/)[1];
  const fallbackAttrs = html.match(/<div class="post-share js-share-default"([^>]*)>/)[1];
  const nativeNode = new Element('div', {class: 'post-share js-share-native'});
  const fallbackNode = new Element('div', {class: 'post-share js-share-default'});
  if (/\bhidden\b/.test(nativeAttrs)) nativeNode.attribs.hidden = '';
  if (/\bhidden\b/.test(fallbackAttrs)) fallbackNode.attribs.hidden = '';
  const preference = nativeAttrs.match(/data-share-preference="([^"]*)"/);
  if (preference) nativeNode.attribs['data-share-preference'] = preference[1];
  const buttonNode = new Element('button', {id: 'share-button'});
  buttonNode.parent = nativeNode; nativeNode.children = [buttonNode];
  const links = [...html.matchAll(/<a([^>]*?)href="([^"]+)"/g)].map(match => {
    const attrs = {class: match[1].match(/\bclass="([^"]*)"/)?.[1] || '', href: match[2].replaceAll('&amp;', '&')};
    const popupSize = match[1].match(/data-popup-size="([^"]*)"/);
    if (popupSize) attrs['data-popup-size'] = popupSize[1];
    return new Element('a', attrs);
  });
  for (const link of links) link.parent = fallbackNode;
  fallbackNode.children = links;
  const tree = {children: [nativeNode, fallbackNode]};
  const doc = {title: 'Title & text', activeElement: null, querySelector: s => selectOne(s, tree.children), getElementById: id => selectOne('#' + id, tree.children)};
  for (const node of selectAll('*', tree.children)) {
    node.style = {}; node.listeners = {}; node.dataset = {};
    for (const [key, value] of Object.entries(node.attribs)) if (key.startsWith('data-')) node.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    node.getAttribute = key => node.attribs[key] ?? null;
    node.setAttribute = (key, value) => {node.attribs[key] = String(value);};
    node.removeAttribute = key => {delete node.attribs[key];};
    node.querySelector = s => selectOne(s, node.children);
    node.addEventListener = (name, fn) => {(node.listeners[name] ||= []).push(fn);};
    node.focus = () => {doc.activeElement = node;};
    Object.defineProperty(node, 'hidden', {get: () => Object.hasOwn(node.attribs, 'hidden'), set: value => {if (value) node.attribs.hidden = ''; else delete node.attribs.hidden;}});
    Object.defineProperty(node, 'href', {get: () => node.attribs.href});
  }
  const source = fs.readFileSync(path.join(root, 'src/js/features/share.js'), 'utf8').replace(/^import .*;\n/gm, '').replaceAll('export function ', 'function ');
  const context = vm.createContext({doc, navigator, window: {location: {href: 'https://example.test/article/'}, open}, qsa: s => selectAll(s, tree.children), Promise});
  vm.runInContext(source, context);
  const native = doc.querySelector('.js-share-native');
  const fallback = doc.querySelector('.js-share-default');
  const button = doc.getElementById('share-button');
  async function click(node = button) {
    let prevented = false;
    for (const handler of node.listeners.click || []) await handler({preventDefault() {prevented = true;}});
    await Promise.resolve(); await Promise.resolve();
    return prevented;
  }
  return {doc, native, fallback, button, init: () => context.setupShare(), popups: () => context.setupSharePopups(), click};
}

for (const mode of ['Native', 'Default']) {
  test(`${mode} renders usable share links before JavaScript, not an orphan label`, () => {
    const state = setup(mode);
    assert.equal(state.fallback.hidden, false);
    assert.equal(state.native.hidden, true);
    assert.equal(state.fallback.querySelector('a').href.startsWith('https:'), true);
  });
}
test('Disabled keeps both groups hidden before and after initialization', () => {
  const state = setup('Disabled', {share: async () => {throw new Error('must not share');}}); state.init();
  assert.equal(state.native.hidden, true); assert.equal(state.fallback.hidden, true);
});
for (const navigator of [{}, {share: null}, {share: 'unsupported'}]) {
  test(`missing/non-callable native sharing retains real fallback links: ${JSON.stringify(navigator)}`, () => {
    const state = setup('Native', navigator); state.init();
    assert.equal(state.native.hidden, true); assert.equal(state.fallback.hidden, false);
    assert.equal(state.doc.activeElement, null, 'Initialization must not move focus');
  });
}
test('supported native sharing opens from the click with the article data', async () => {
  const calls = []; const state = setup('Native', {share: async data => {calls.push(data);}}); state.init();
  assert.equal(state.native.hidden, false); assert.equal(state.fallback.hidden, true);
  assert.equal(await state.click(), true);
  assert.equal(calls.length, 1); assert.equal(calls[0].url, 'https://example.test/article/'); assert.equal(calls[0].title, 'Title & text');
});
test('Default preference is not replaced by an available native API', () => {
  const state = setup('Default', {share: async () => {}}); state.init();
  assert.equal(state.native.hidden, true); assert.equal(state.fallback.hidden, false);
});
for (const canShare of [() => false, () => {throw new Error('policy blocked');}]) {
  test(`unsupported/policy-blocked payload uses fallback: ${canShare.toString()}`, () => {
    const state = setup('Native', {share: async () => {}, canShare}); state.init();
    assert.equal(state.native.hidden, true); assert.equal(state.fallback.hidden, false);
  });
}
for (const name of ['NotAllowedError', 'TypeError', 'DataError', 'InvalidStateError']) {
  test(`native rejection ${name} reveals working links and focuses the first`, async () => {
    const state = setup('Native', {share: async () => {throw Object.assign(new Error('failed'), {name});}}); state.init(); await state.click();
    assert.equal(state.native.hidden, true); assert.equal(state.fallback.hidden, false);
    assert.equal(state.doc.activeElement, state.fallback.querySelector('a'));
  });
}
test('synchronous native failure reveals fallback', async () => {
  const state = setup('Native', {share: () => {throw new Error('unsupported');}}); state.init(); await state.click();
  assert.equal(state.native.hidden, true); assert.equal(state.fallback.hidden, false);
});
test('Cancel or Back retains the native share control without revealing classic links', async () => {
  const state = setup('Native', {share: async () => {throw Object.assign(new Error('cancelled'), {name: 'AbortError'});}}); state.init(); state.button.focus(); await state.click();
  assert.equal(state.native.hidden, false); assert.equal(state.fallback.hidden, true); assert.equal(state.button.disabled, false);
  assert.equal(state.doc.activeElement, state.button);
});
test('native sharing can be retried successfully after cancellation', async () => {
  let calls = 0;
  const state = setup('Native', {share: async () => {
    if (++calls === 1) throw Object.assign(new Error('cancelled'), {name: 'AbortError'});
  }});
  state.init(); state.init(); await state.click(); await state.click();
  assert.equal(calls, 2); assert.equal(state.native.hidden, false);
  assert.equal(state.fallback.hidden, true); assert.equal(state.button.disabled, false);
});
test('a missing rejection value still reveals fallback rather than throwing in the handler', async () => {
  const state = setup('Native', {share: async () => {throw null;}}); state.init(); await state.click();
  assert.equal(state.native.hidden, true); assert.equal(state.fallback.hidden, false);
  assert.equal(state.button.disabled, false);
});
test('repeated initialization and pending clicks cannot open duplicate dialogs', async () => {
  let resolve; let calls = 0; const state = setup('Native', {share: () => {calls++; return new Promise(done => {resolve = done;});}}); state.init(); state.init();
  const first = state.click(); await state.click(); assert.equal(calls, 1); resolve(); await first; assert.equal(state.button.disabled, false);
});
test('blocked popup leaves ordinary anchor navigation available', async () => {
  const state = setup('Default'); state.popups();
  assert.equal(await state.click(state.fallback.querySelector('a')), false);
});
test('popup errors leave ordinary anchor navigation available', async () => {
  const state = setup('Default', {}, () => {throw new Error('blocked');}); state.popups();
  assert.equal(await state.click(state.fallback.querySelector('a')), false);
});
test('repeated popup initialization opens only one window per click', async () => {
  let calls = 0;
  const state = setup('Default', {}, () => {calls++; return {opener: {}};});
  state.popups(); state.popups();
  await state.click(state.fallback.querySelector('a'));
  assert.equal(calls, 1);
});
test('email remains a normal mail link rather than a scripted popup', async () => {
  const state = setup('Default'); state.popups();
  const email = state.doc.querySelector('.email');
  assert.ok(email.href.startsWith('mailto:'));
  assert.equal(await state.click(email), false);
});

test('opened social popup severs its opener before preventing ordinary navigation', async () => {
  const popup = {opener: {}}; const state = setup('Default', {}, () => popup); state.popups();
  assert.equal(await state.click(state.fallback.querySelector('a')), true); assert.equal(popup.opener, null);
});
