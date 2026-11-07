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

test('native Portal frame scheme matches its normal-scheme document', () => {
  assert.ok(nativeRules.some(rule => rule.nodes.some(node => node.type === 'decl' && node.prop === 'color-scheme' && node.value === 'normal')),
    'A mismatched iframe scheme can force an opaque canvas in dark mode');
});
