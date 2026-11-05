const assert = require('node:assert/strict');
const path = require('node:path');
const {test} = require('node:test');
const sass = require('sass');
const postcss = require('postcss');
const sassRoot = path.resolve(process.env.THEME_ROOT || path.resolve(__dirname, '../..'), 'src/sass');
const css = postcss.parse(sass.compile(path.join(sassRoot, 'style.scss'), {style: 'compressed', silenceDeprecations: ['import']}).css);

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
