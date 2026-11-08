const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const {test} = require('node:test');
const sass = require('sass');
const postcss = require('postcss');
const sassRoot = path.resolve(process.env.THEME_ROOT || path.resolve(__dirname, '../..'), 'src/sass');
const css = postcss.parse(sass.compile(path.join(sassRoot, 'style.scss'), {style: 'compressed', silenceDeprecations: ['import']}).css);

test('the blockdyor wordmark reserves its measured 320 by 75 intrinsic ratio', () => {
  const template = fs.readFileSync(path.resolve(sassRoot, '../../default.hbs'), 'utf8');
  const image = template.match(/<img src="{{img_url @site.logo size="s"}}"[^>]*>/)[0];
  assert.match(image, /\bwidth="320"/);
  assert.match(image, /\bheight="75"/);
});

test('TOC active-link colors do not animate non-composited paint properties', () => {
  const declarations = {};
  css.walkRules(rule => {
    if (['.toc-link', '.toc-link.is-active'].includes(rule.selector)) {
      declarations[rule.selector] = Object.fromEntries(rule.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]));
    }
  });
  assert.equal(declarations['.toc-link'].transition, 'none');
  assert.equal(declarations['.toc-link'].color, 'var(--color-content-secondary)');
  assert.equal(declarations['.toc-link.is-active'].color, 'var(--color-content-lead)');
  assert.equal(declarations['.toc-link.is-active']['border-left-color'], 'var(--color-content-lead)');
});

test('the monochrome navigation logo is dark on light surfaces', () => {
  let filter;
  css.walkRules(rule => {
    if (rule.selector === '.nav-brand .logo img' && rule.parent.type === 'root') {
      filter = rule.nodes.find(node => node.prop === 'filter')?.value;
    }
  });
  assert.equal(filter, 'brightness(0)', 'A white uploaded wordmark must not disappear on the light homepage');
});

test('the monochrome navigation logo is light in manually selected dark mode', () => {
  let filter;
  css.walkRules(rule => {
    if (rule.selector === '.theme-dark .nav-brand .logo img') {
      filter = rule.nodes.find(node => node.prop === 'filter')?.value;
    }
  });
  assert.equal(filter, 'brightness(0) invert(1)');
});

test('system-dark logo styling does not override manually selected light mode', () => {
  let filter;
  css.walkRules(rule => {
    if (rule.selector === 'html:not(.theme-light) .nav-brand .logo img' &&
        rule.parent.type === 'atrule' && rule.parent.params === '(prefers-color-scheme: dark)') {
      filter = rule.nodes.find(node => node.prop === 'filter')?.value;
    }
  });
  assert.equal(filter, 'brightness(0) invert(1)');
});

test('a logo over a cover image stays white in either theme', () => {
  let filter;
  css.walkRules(rule => {
    if (rule.selector === '.cover-active .nav-header .logo img') {
      filter = rule.nodes.find(node => node.prop === 'filter')?.value;
    }
  });
  assert.equal(filter, 'brightness(0) invert(1)');
});

test('navigation glass pills use ink for their actual normal and hovered fills', () => {
  const declarations = {};
  css.walkRules(rule => {
    if (['.nav-button-primary', '.nav-button-primary:hover'].includes(rule.selector)) {
      declarations[rule.selector] = Object.fromEntries(rule.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]));
    }
  });
  assert.equal(declarations['.nav-button-primary'].color, 'var(--color-on-accent-glass)');
  assert.equal(declarations['.nav-button-primary:hover'].color, 'var(--color-on-accent-glass-hover)');
  assert.ok(declarations['.nav-button-primary'].background.includes('72%'));
  assert.ok(declarations['.nav-button-primary:hover'].background.includes('62%'));
});

test('footer network navigation retains its flex layout without the blocked selector', () => {
  let layout;
  css.walkRules(rule => {
    assert.notEqual(rule.selector, '.footer-social');
    if (rule.selector === '.footer-network-links') layout = rule;
  });
  assert.ok(layout, 'Missing footer network layout');
  assert.ok(layout.nodes.some(node => node.type === 'decl' && node.prop === 'display' && node.value === 'flex'));
  assert.ok(layout.nodes.some(node => node.type === 'decl' && node.prop === 'flex-wrap' && node.value === 'wrap'), 'Additional footer links must wrap instead of extending the row');
});

test('bookmark containers have one unambiguous minimum height per rule', () => {
  let checked = 0;
  css.walkRules(rule => {
    if (!rule.selector.includes('a.kg-bookmark-container')) return;
    const heights = rule.nodes.filter(node => node.type === 'decl' && node.prop === 'min-height');
    if (!heights.length) return;
    checked++;
    assert.equal(heights.length, 1, `Duplicate min-height in ${rule.selector}`);
  });
  assert.ok(checked >= 2, 'Expected both bookmark layout sections');
});

test('signup card background color does not reset cover sizing or positioning', () => {
  let card;
  css.walkRules(rule => {
    if (rule.parent.type === 'root' && rule.selector === '.post-content .kg-signup-card') card = rule;
  });
  assert.ok(card, 'Missing signup card rule');
  const declarations = Object.fromEntries(card.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]));
  assert.equal(declarations['background-size'], 'cover');
  assert.equal(declarations['background-position'], 'center');
  assert.equal(declarations['background-color'], 'var(--color-background-secondary)');
  assert.equal(declarations.background, undefined, 'Shorthand resets the preceding background longhands');
});

test('dark mixin scopes every selector in a comma-separated component list', () => {
  const output = postcss.parse(sass.compileString('@use "mixins"; .one, .two { @include mixins.dark { color: white; } }', {loadPaths: [sassRoot]}).css);
  const manual = [];
  const system = [];
  output.walkRules(rule => {
    const selectors = rule.selector.split(',').map(value => value.trim());
    if (rule.parent.type === 'atrule') system.push(...selectors);
    else manual.push(...selectors);
  });
  assert.deepEqual(manual, ['.theme-dark .one', '.theme-dark .two']);
  assert.deepEqual(system, ['html:not(.theme-light) .one', 'html:not(.theme-light) .two']);
});
