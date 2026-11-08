const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const {Element, Text, Document} = require('domhandler');
const {selectAll, is} = require('css-select');
const {default: serialize} = require('dom-serializer');
const selectorParser = require('postcss-selector-parser');
const sass = require('sass');
const postcss = require('postcss');
const root = path.resolve(process.env.THEME_ROOT || path.join(__dirname, '../..'));

// Real selector/tree dependencies, with the standard DOM attribute/query API.
function element(name, attribs = {}, children = []) {
  const node = new Element(name, attribs, children);
  children.forEach((child, index) => {
    child.parent = node;
    child.prev = children[index - 1] || null;
    child.next = children[index + 1] || null;
  });
  node.querySelectorAll = selector => selectAll(selector, node.children);
  node.closest = selector => {
    for (let current = node; current?.type === 'tag'; current = current.parent) if (is(current, selector)) return current;
    return null;
  };
  node.getAttribute = name => node.attribs[name] ?? null;
  node.hasAttribute = name => Object.hasOwn(node.attribs, name);
  node.setAttribute = (name, value) => {node.attribs[name] = value;};
  Object.defineProperties(node, {
    id: {get: () => node.attribs.id || ''},
    nodeName: {get: () => node.name.toUpperCase()},
    textContent: {get: () => require('domutils').textContent(node)}
  });
  return node;
}

function fixture(theme = 'theme-light') {
  // Native structure from nerdnos-live-parent.html and inner-mobile LHR image-alt.
  const label = element('span', {style: 'white-space: pre-wrap;'}, [new Text('NerdNOS Metal Evaluation')]);
  const title = element('h4', {class: 'kg-product-card-title', id: 'evaluation', 'data-native': 'keep'}, [label]);
  const image = element('img', {src: '', width: '300', height: '300', class: 'kg-product-card-image', loading: 'lazy'});
  const paragraph = element('p', {}, [element('span', {style: 'white-space: pre-wrap;'}, [new Text('The NerdNOS Metal earns a 75/100.')])]);
  const description = element('div', {class: 'kg-product-card-description'}, [paragraph]);
  const product = element('div', {class: 'kg-card kg-product-card'}, [element('div', {class: 'kg-product-card-container'}, [image, element('div', {class: 'kg-product-card-title-container'}, [title]), description])]);
  const author = element('span', {class: 'kg-bookmark-author'}, [new Text('blockdyor')]);
  const publisher = element('span', {class: 'kg-bookmark-publisher'}, [new Text('Andrea Carnimeo')]);
  const bookmark = element('figure', {class: 'kg-card kg-bookmark-card'}, [element('a', {class: 'kg-bookmark-container', href: '/review/'}, [element('div', {class: 'kg-bookmark-content'}, [element('div', {class: 'kg-bookmark-metadata'}, [author, publisher])])])]);
  const editorial = element('h4', {id: 'editorial'}, [new Text('Editorial heading')]);
  const section = element('section', {class: 'post-content'}, [element('h2', {}, [new Text('Verdict')]), product, bookmark, editorial]);
  const html = element('html', {class: theme}, [element('body', {}, [section])]);
  const document = new Document([html]); html.parent = document;
  return {html, section, title, label, image, paragraph, description, author, publisher, editorial, product};
}

function runEntry(entry, section, inspectTOC = () => {}) {
  const file = fs.readFileSync(path.join(root, 'src/js/entries', entry + '.js'), 'utf8');
  const context = {onReady: callback => callback(), qs: () => section, doc: {currentScript: null}, initTOC: inspectTOC};
  for (const match of file.matchAll(/^import \{([^}]+)\}.*;$/gm)) {
    for (const name of match[1].split(',').map(name => name.trim())) context[name] ??= () => {};
  }
  const helper = path.join(root, 'src/js/features/content-cards.js');
  if (fs.existsSync(helper)) vm.runInNewContext(fs.readFileSync(helper, 'utf8').replace(/export function /g, 'function '), context);
  vm.runInNewContext(file.replace(/^import .*;\n/gm, ''), context);
}

for (const entry of ['post', 'page']) {
  test(`${entry} fixes only native product semantics before TOC without replacing nodes or labels`, () => {
    const state = fixture();
    const beforeAttributes = {...state.title.attribs};
    let tocLevel;
    runEntry(entry, state.section, () => {tocLevel = state.title.getAttribute('aria-level');});
    assert.equal(state.title.getAttribute('aria-level'), '2', 'Native hardcoded h4 must expose section heading level 2');
    if (entry === 'post') assert.equal(tocLevel, '2', 'Repair must precede TOC initialization');
    assert.equal(state.title.name, 'h4', 'Keep native tag for existing CSS and tocbot hierarchy');
    assert.deepEqual(state.title.attribs, {...beforeAttributes, 'aria-level': '2'});
    assert.equal(state.title.children[0], state.label);
    assert.deepEqual(selectAll('h2, h3, h4', state.section.children).map(node => node.attribs.id || node.children[0].data), ['Verdict', 'evaluation', 'editorial']);
    assert.equal(state.editorial.getAttribute('aria-level'), null);
    assert.equal(state.image.getAttribute('alt'), '', 'Only blank native placeholder is decorative');
    const snapshot = serialize(state.product);
    runEntry(entry, state.section);
    assert.equal(serialize(state.product), snapshot, 'Repair is idempotent');
  });
}

test('native title repair leaves actual tocbot anchors, labels and hierarchy unchanged', () => {
  const context = {window: {HTMLElement: Element, parent: {HTMLElement: Element}}};
  const source = fs.readFileSync(path.join(root, 'node_modules/tocbot/src/js/parse-content.js'), 'utf8');
  vm.runInNewContext(source.replace('export default function', 'function'), context);
  const parser = context.parseContent({collapseDepth: 2});
  const state = fixture();
  const headings = parser.selectHeadings(state.section, 'h2, h3, h4');
  const before = JSON.stringify(parser.nestHeadingsArray(headings));
  runEntry('post', state.section);
  assert.equal(JSON.stringify(parser.nestHeadingsArray(parser.selectHeadings(state.section, 'h2, h3, h4'))), before);
  assert.ok(before.includes('NerdNOS Metal Evaluation'));
  assert.ok(before.includes('evaluation'));
});

for (const source of [
  {src: '/content/images/2026/01/Bitforge-Nano-Logo.webp'},
  {src: '', srcset: '/product.webp 300w'},
  {src: '', 'data-src': '/lazy-product.webp'}
]) {
  test(`an unnamed native product image uses its existing product title (${Object.keys(source).at(-1)})`, () => {
    const state = fixture();
    state.label.children[0].data = 'BitForge Nano Evaluation';
    for (const [name, value] of Object.entries(source)) state.image.setAttribute(name, value);
    const before = {...state.image.attribs};
    runEntry('post', state.section);
    assert.equal(state.image.getAttribute('alt'), 'BitForge Nano Evaluation');
    assert.deepEqual(state.image.attribs, {...before, alt: 'BitForge Nano Evaluation'}, 'Do not change image URLs or dimensions');
  });
}

test('an unnamed real product image without a product title remains an editorial issue', () => {
  const state = fixture();
  state.label.children[0].data = '  ';
  state.image.setAttribute('src', '/real-product.webp');
  runEntry('post', state.section);
  assert.equal(state.image.getAttribute('alt'), null, 'Never manufacture a product name or visual description');
});

test('authored alternatives, decorative intent and existing heading semantics are not overwritten', () => {
  const state = fixture();
  state.title.setAttribute('aria-level', '3');
  const cases = [
    {src: '/miner.webp', alt: 'Author description'}, {src: '', alt: ''},
    {src: '', 'aria-label': 'Miner'}, {src: '', 'aria-labelledby': 'caption'},
    {src: '', title: 'Miner'}, {src: '', role: 'img'}
  ];
  const images = cases.map(attrs => element('img', {class: 'kg-product-card-image', ...attrs}));
  const absentSource = element('img', {class: 'kg-product-card-image'});
  const container = state.product.children[0];
  for (const image of [...images, absentSource]) {container.children.push(image); image.parent = container;}
  runEntry('post', state.section);
  assert.equal(state.title.getAttribute('aria-level'), '3');
  images.forEach((image, index) => assert.deepEqual(image.attribs, {class: 'kg-product-card-image', ...cases[index]}));
  assert.equal(absentSource.getAttribute('alt'), '');
});

// Ghost /public/cards.min.css?v=WwnU9jw5ancNC8Gc, retrieved 2026-11-08.
// These later-loaded native opacity rules caused the measured failures.
const nativeCSS = '.kg-bookmark-metadata>*:not(img){opacity:.7}.kg-product-card .kg-product-card-description p,.kg-product-card .kg-product-card-description ol,.kg-product-card .kg-product-card-description ul{opacity:.7}';
const css = postcss.parse(sass.compile(path.join(root, 'src/sass/style.scss'), {style: 'compressed', silenceDeprecations: ['import']}).css + nativeCSS);
function specificity(selector) {
  let score = 0;
  selectorParser(tree => tree.walk(node => {
    if (node.type === 'id') score += 10000;
    if (node.type === 'class' || node.type === 'attribute') score += 100;
    if (node.type === 'tag') score++;
    if (node.type === 'pseudo' && ![':not', ':is', ':has', ':where'].includes(node.value)) score += node.value.startsWith('::') ? 1 : 100;
  })).processSync(selector);
  return score;
}
function declaration(node, property, systemDark) {
  let result, priority = -1;
  css.walkRules(rule => {
    for (let parent = rule.parent; parent.type !== 'root'; parent = parent.parent) {
      if (parent.type === 'atrule' && parent.name === 'media' && parent.params.includes('prefers-color-scheme: dark') && !systemDark) return;
    }
    for (const selector of rule.selectors) {
      let matches = false;
      try {matches = is(node, selector);} catch {} // Unsupported dynamic browser pseudo-classes cannot apply in this fixture.
      if (!matches) continue;
      for (const decl of rule.nodes.filter(item => item.type === 'decl' && item.prop === property)) {
        const score = specificity(selector) + (decl.important ? 1000000 : 0);
        if (score >= priority) {priority = score; result = decl.value;}
      }
    }
  });
  return result;
}
function rgb(hex) {
  let text = hex.replace('#', '');
  if (text.length === 3) text = [...text].map(char => char + char).join('');
  return [0, 2, 4].map(index => Number.parseInt(text.slice(index, index + 2), 16));
}
function luminance(color) {
  return color.map(value => {value /= 255; return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;}).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}
for (const [theme, systemDark] of [['theme-light', false], ['theme-dark', false], ['', false], ['', true], ['theme-light', true]]) {
  for (const name of ['description', 'author', 'publisher']) {
    test(`native ${name} clears 4.5:1 in ${theme || 'system'} (system dark ${systemDark})`, () => {
      const state = fixture(theme);
      const node = state[name];
      const surface = name === 'description' ? '--color-background-main' : '--color-background-secondary';
      const color = declaration(node, 'color', systemDark);
      const foreground = rgb(declaration(state.html, color.slice(4, -1), systemDark));
      const background = rgb(declaration(state.html, surface, systemDark));
      const opacity = Number(declaration(name === 'description' ? state.paragraph : node, 'opacity', systemDark) || 1);
      const painted = foreground.map((value, index) => value * opacity + background[index] * (1 - opacity));
      const values = [luminance(painted), luminance(background)].sort((a, b) => b - a);
      const contrast = (values[0] + 0.05) / (values[1] + 0.05);
      assert.ok(contrast >= 4.5, `${node.attribs.class}: ${contrast.toFixed(2)}:1 after native opacity ${opacity}`);
      assert.equal(color, 'var(--color-content-main)', 'Use shared main text token only on measured card text');
    });
  }
}
