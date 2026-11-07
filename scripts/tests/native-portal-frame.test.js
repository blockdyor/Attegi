const assert = require('node:assert/strict');
const path = require('node:path');
const {test} = require('node:test');
const sass = require('sass');
const postcss = require('postcss');

const css = postcss.parse(sass.compile(path.resolve(__dirname, '../../src/sass/style.scss'), {style: 'compressed', silenceDeprecations: ['import']}).css);
const nativeRules = [];
css.walkRules(rule => {
  if (rule.selector.includes('.gh-portal-triggerbtn-iframe')) nativeRules.push(rule);
});

test('the theme does not hide Ghost’s editable Portal launcher', () => {
  for (const rule of nativeRules) {
    rule.walkDecls('display', declaration => {
      assert.notEqual(declaration.value, 'none', 'Native Portal label/icon settings must remain visible');
    });
  }
});

test('native Portal popup frames use their document scheme, not the parent dark scheme', () => {
  const popupRules = [];
  css.walkRules(rule => {
    if (rule.selector.split(',').some(selector => selector.trim() === '#ghost-portal-root iframe')) popupRules.push(rule);
  });
  assert.ok(popupRules.some(rule => rule.nodes.some(node => node.type === 'decl' && node.prop === 'color-scheme' && node.value === 'normal')),
    'The popup is a separate iframe: aligning only the launcher leaves an opaque dark-mode canvas');
});

test('native search popup frames keep their transparent normal-scheme canvas', () => {
  const searchRules = [];
  css.walkRules(rule => {
    if (rule.selector.split(',').some(selector => selector.trim() === '#sodo-search-root iframe')) searchRules.push(rule);
  });
  assert.ok(searchRules.some(rule => rule.nodes.some(node => node.type === 'decl' && node.prop === 'color-scheme' && node.value === 'normal')),
    'Native search has a separate iframe and must not inherit the parent dark scheme');
});

test('native Portal frame scheme matches its normal-scheme document', () => {
  assert.ok(nativeRules.some(rule => rule.nodes.some(node => node.type === 'decl' && node.prop === 'color-scheme' && node.value === 'normal')),
    'A mismatched iframe scheme can force an opaque canvas in dark mode');
});
