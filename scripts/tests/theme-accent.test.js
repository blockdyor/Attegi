const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const Handlebars = require('handlebars');
const sass = require('sass');
const postcss = require('postcss');

const root = process.env.THEME_ROOT || path.resolve(__dirname, '../..');
const template = fs.readFileSync(path.join(root, 'default.hbs'), 'utf8');
const bootstrap = template.match(/<script data-cfasync="false">([\s\S]*?)<\/script>/)[1];
const colors = postcss.parse(sass.compile(path.join(root, 'src/sass/_colors.scss')).css);

function accentStyles(accent) {
  const styles = [];
  const source = Handlebars.compile(bootstrap)({}, {
    data: {site: {accent_color: accent}, custom: {color_scheme: 'System', darkmode_accent_color: '#82C0CC'}}
  });
  vm.runInNewContext(source, {
    document: {
      documentElement: {classList: {add() {}, remove() {}}},
      createElement: () => ({textContent: ''}),
      head: {appendChild: style => styles.push(style.textContent)},
      querySelectorAll: () => []
    },
    window: {matchMedia: () => ({matches: false, addEventListener() {}})},
    localStorage: {getItem: () => null}
  });
  return postcss.parse(styles.join('\n'));
}

for (const [accent, expectedInk] of [['#F7931A', '#1D1F21'], ['#101010', '#fff'], ['#FFFFFF', '#1D1F21']]) {
  test(`bootstrap preserves computed ink for accent ${accent}`, () => {
    const runtime = accentStyles(accent);
    const light = runtime.nodes.find(rule => rule.selector === ':root');
    const ink = light.nodes.find(decl => decl.prop === '--attegi-on-accent');
    assert.ok(ink, 'Missing separate runtime ink token');
    assert.equal(ink.value, expectedInk);
    assert.ok(light.nodes.some(decl => decl.prop === '--attegi-accent-text'));
  });
}

test('glass accent ink is readable against the actual normal and hover mixtures', () => {
  const luminance = rgb => rgb.map(channel => channel / 255).map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  for (const accent of ['#3A6B7E', '#000000', '#FFFFFF', '#F7931A', '#101010', '#BE834F']) {
    const runtime = accentStyles(accent);
    for (const [selector, value] of [[':root', accent], ['.theme-dark:root', '#82C0CC']]) {
      const rule = runtime.nodes.find(node => node.selector === selector);
      const rgb = [1, 3, 5].map(start => parseInt(value.slice(start, start + 2), 16));
      for (const [suffix, amount] of [['', 0.72], ['-hover', 0.62]]) {
        const ink = rule.nodes.find(node => node.prop === '--attegi-on-accent-glass' + suffix)?.value;
        assert.ok(ink === '#000' || ink === '#fff', 'Missing glass-specific ink for ' + value + suffix);
        const bg = luminance(rgb.map(channel => channel * amount + 255 * (1 - amount)));
        const fg = ink === '#fff' ? 1 : 0;
        assert.ok((Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05) >= 4.5, value + suffix);
      }
    }
  }
});

test('later stylesheet consumes computed glass ink without redefining it', () => {
  for (const suffix of ['', '-hover']) {
    let found = false;
    colors.walkDecls('--color-on-accent-glass' + suffix, decl => {
      assert.ok(decl.value.startsWith('var(--attegi-on-accent-glass' + suffix + ','));
      found = true;
    });
    assert.ok(found, 'Missing glass ink consumer ' + suffix);
  }
});

test('later stylesheet consumes runtime accent values instead of overwriting them', () => {
  let count = 0;
  colors.walkDecls('--color-on-accent', decl => {
    assert.match(decl.value, /^var\(--attegi-on-accent,/);
    count++;
  });
  assert.ok(count >= 2, 'Light and dark fallbacks must both consume the runtime value');
  colors.walkDecls('--color-accent-text', decl => {
    assert.match(decl.value, /^var\(--attegi-accent-text,/);
  });
  colors.walkDecls(/^--attegi-(?:on-accent|accent-text)$/, () => {
    assert.fail('Static CSS must not redefine computed accent tokens');
  });
});
