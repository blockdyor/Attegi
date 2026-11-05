const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const Handlebars = require('handlebars');

const themeRoot = process.env.THEME_ROOT || path.resolve(__dirname, '../..');
const networks = ['twitter', 'facebook', 'linkedin', 'bluesky', 'threads', 'mastodon', 'tiktok', 'youtube', 'instagram'];

function renderer() {
  const hbs = Handlebars.create();
  hbs.templates = {};
  // Model Ghost's registered helper: bare {{link_class}} must not resolve
  // a partial parameter, even when the context contains that property.
  hbs.registerHelper('link_class', (options) => {
    if (!Object.hasOwn(options.hash, 'for')) {
      throw new Error('The {{link_class}} helper requires a for="" attribute.');
    }
    return '';
  });
  hbs.registerHelper('social_url', function (options) {
    return `https://social.example/${options.hash.type}`;
  });
  hbs.registerHelper('t', value => value);
  hbs.registerHelper('asset', value => `/assets/${value}`);
  for (const name of ['block', 'date', 'navigation', 'body_class', 'ghost_head', 'ghost_foot', 'plural', 'img_url']) {
    hbs.registerHelper(name, () => '');
  }
  hbs.registerHelper('author', function (options) { return options.fn(this.author); });
  hbs.registerPartial('loop', '');
  hbs.registerPartial('social-links', fs.readFileSync(path.join(themeRoot, 'partials/social-links.hbs'), 'utf8'));
  for (const file of fs.readdirSync(path.join(themeRoot, 'partials/icons'))) {
    if (file.endsWith('.hbs')) {
      hbs.registerPartial(`icons/${file.slice(0, -4)}`, fs.readFileSync(path.join(themeRoot, 'partials/icons', file), 'utf8'));
    }
  }
  return hbs;
}

function renderTemplate(hbs, name, context, site = {}) {
  hbs.templates[name] ||= hbs.compile(fs.readFileSync(path.join(themeRoot, name), 'utf8'));
  return hbs.templates[name](context, {
    data: {site, custom: {color_scheme: 'System'}}
  });
}

for (const network of networks) {
  test(`footer and error shell render with ${network} configured`, () => {
    const hbs = renderer();
    const site = {title: 'Test site', url: 'https://example.com', [network]: 'account'};
    for (const body of ['Home', '404', '500', '400']) {
      const html = renderTemplate(hbs, 'default.hbs', {body}, site);
      assert.match(html, new RegExp(`class="social-link" href="https://social.example/${network}"`));
      assert.ok(html.includes(body));
    }
  });
  test(`author renders ${network} without a class parameter`, () => {
    const html = renderTemplate(renderer(), 'author.hbs', {author: {name: 'Author', [network]: 'account'}, pagination: {total: 0}});
    assert.match(html, new RegExp(`class="" href="https://social.example/${network}"`));
    assert.ok(!html.includes('class="social-link"'));
  });
}

test('no accounts render no social links, including site accounts on an author without accounts', () => {
  const hbs = renderer();
  const html = renderTemplate(hbs, 'author.hbs', {author: {name: 'Author'}, pagination: {total: 0}}, {twitter: 'site-account'});
  assert.doesNotMatch(html, /href="https:\/\/social\.example\//);
  assert.doesNotThrow(() => renderTemplate(hbs, 'default.hbs', {body: 'Home'}));
});

test('footer renders the blockdyor CC BY-SA notice with a bundled icon', () => {
  const html = renderTemplate(renderer(), 'default.hbs', {body: 'Home'}, {title: 'blockdyor'});
  const footer = html.match(/<footer\b[\s\S]*?<\/footer>/)[0];
  assert.match(footer, /blockdyor is licensed under a/);
  assert.match(footer, /rel="license noopener nofollow"[^>]*href="https:\/\/creativecommons.org\/licenses\/by-sa\/4\.0\/"/);
  assert.match(footer, /Creative Commons Attribution-ShareAlike 4\.0 International License/);
  assert.match(footer, /class="footer-license-icon" src="\/assets\/img\/cc-by-sa\.svg" alt="" aria-hidden="true" width="42" height="13"/);
  assert.doesNotMatch(footer, /<img[^>]+src="(?:https?:)?\/\//);
  const icon = fs.readFileSync(path.join(themeRoot, 'assets/img/cc-by-sa.svg'), 'utf8');
  assert.match(icon, /<svg\b/);
  assert.doesNotMatch(icon, /<script\b|<image\b|<foreignObject\b|(?:href|src)\s*=/i);
});

test('partial escapes its caller-provided class', () => {
  const hbs = renderer();
  const html = hbs.compile('{{> "social-links" source=source social_link_class=cssClass}}')({
    source: {twitter: 'account'}, cssClass: 'social-link" onclick="alert(1)'
  });
  assert.ok(html.includes('social-link&quot; onclick&#x3D;&quot;alert(1)'));
});
