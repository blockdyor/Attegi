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

function renderTemplate(hbs, name, context, site = {}, member = null, custom = {}) {
  hbs.templates[name] ||= hbs.compile(fs.readFileSync(path.join(themeRoot, name), 'utf8'));
  return hbs.templates[name](context, {
    data: {site, member, custom: {color_scheme: 'System', ...custom}}
  });
}

function renderFooterLinks(extraCustom = {}) {
  const site = {url: 'https://example.com', ...Object.fromEntries(networks.map(key => [key, 'account']))};
  const custom = {github_url: 'https://github.com/example', telegram_url: 'https://t.me/example', discord_url: 'https://discord.gg/example', email_address: 'hello@example.com', ...extraCustom};
  const html = renderTemplate(renderer(), 'default.hbs', {body: 'Home'}, site, null, custom);
  const group = html.match(/<div class="(footer-(?:social|network-links))">([\s\S]*?)<\/div>/);
  assert.ok(group, 'Missing footer link group');
  return {className: group[1], html: group[2]};
}

test('ordinary footer navigation does not match Fanboy’s generic social-wrapper filter', () => {
  // Fanboy source: fanboy-addon/fanboy_social_general_hide.txt, rule ##.footer-social.
  assert.notEqual(renderFooterLinks().className, 'footer-social');
});

test('footer links retain every label and self-contained inline SVG', () => {
  const html = renderFooterLinks().html;
  const labels = Array.from(html.matchAll(/<a\b[^>]*aria-label="([^"]+)"/g), match => match[1]);
  const expected = ['RSS', 'X', 'Bluesky', 'Instagram', 'Telegram', 'Discord', 'GitHub', 'Email'];
  assert.deepEqual(labels, expected);
  assert.equal((html.match(/<svg\b/g) || []).length, expected.length);
  assert.doesNotMatch(html, /<(?:img|image|use|script|iframe)\b[^>]*(?:src|href)=/i);
});

const extraFooterNetworks = [['nostr', 'Nostr'], ['amboss', 'Amboss'], ['mempool', 'Mempool.space']];

for (const [key, label] of extraFooterNetworks) {
  test(`footer exposes the optional ${label} URL setting and renders its inline icon`, () => {
    const config = JSON.parse(fs.readFileSync(path.join(themeRoot, 'package.json'), 'utf8')).config.custom;
    assert.equal(config[`${key}_url`]?.type, 'text');
    const url = `https://example.com/${key}?first=1&second=2`;
    const html = renderTemplate(renderer(), 'default.hbs', {body: 'Home'}, {}, null, {[`${key}_url`]: url});
    const link = Array.from(html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g), match => match[0]).find(anchor => anchor.includes(`aria-label="${label}"`));
    assert.ok(link, `Missing ${label} footer link`);
    assert.ok(link.includes(`href="${Handlebars.escapeExpression(url)}"`));
    assert.ok(link.includes('class="social-link"'));
    assert.ok(link.includes('target="_blank" rel="noopener nofollow"'));
    assert.match(link, /<svg\b/);
  });

  test(`footer hides ${label} when its URL is empty`, () => {
    const html = renderTemplate(renderer(), 'default.hbs', {body: 'Home'}, {}, null, {[`${key}_url`]: ''});
    assert.ok(!html.includes(`aria-label="${label}"`));
  });
}

test('all three new networks coexist with the existing footer links', () => {
  const custom = Object.fromEntries(extraFooterNetworks.map(([key]) => [`${key}_url`, `https://example.com/${key}`]));
  const html = renderFooterLinks(custom).html;
  const originalCount = (renderFooterLinks().html.match(/<svg\b/g) || []).length;
  assert.equal((html.match(/<svg\b/g) || []).length, originalCount + extraFooterNetworks.length);
  for (const [, label] of extraFooterNetworks) assert.ok(html.includes(`aria-label="${label}"`));
  assert.ok(!html.includes('aria-label="Stacker News"'));
});

test('every footer icon link uses nofollow, noopener and a new tab, including RSS and email', () => {
  const custom = Object.fromEntries(extraFooterNetworks.map(([key]) => [`${key}_url`, `https://example.com/${key}`]));
  const legacyHtml = renderTemplate(renderer(), 'default.hbs', {body: 'Home'}, {}, null, {instagram_url: 'https://example.com/instagram', bluesky_url: 'https://example.com/bluesky'});
  const legacyGroup = legacyHtml.match(/<div class="footer-network-links">([\s\S]*?)<\/div>/)?.[1];
  assert.ok(legacyGroup?.includes('aria-label="Instagram"') && legacyGroup.includes('aria-label="Bluesky"'));
  for (const html of [renderFooterLinks(custom).html, legacyGroup]) {
    const links = Array.from(html.matchAll(/<a\b[^>]*>/g), match => match[0]);
    assert.ok(links.length > 0);
    for (const link of links) {
      assert.match(link, /target="_blank"/);
      const rel = (link.match(/\brel="([^"]+)"/)?.[1] || '').split(/\s+/);
      assert.ok(rel.includes('nofollow'), `Missing nofollow: ${link}`);
      assert.ok(rel.includes('noopener'), `Missing noopener: ${link}`);
    }
  }
});

test('new footer icons inherit link colors without external assets or colored gradients', () => {
  for (const [key] of extraFooterNetworks) {
    const svg = fs.readFileSync(path.join(themeRoot, `partials/icons/icon-${key}.hbs`), 'utf8');
    assert.match(svg, /<svg\b[^>]*fill="currentColor"/);
    assert.doesNotMatch(svg, /(?:fill|stroke|stop-color)="(?:#|rgb)|<linearGradient\b|<style\b|<script\b|<image\b|<use\b|(?:href|src)\s*=/i);
  }
  const config = JSON.parse(fs.readFileSync(path.join(themeRoot, 'package.json'), 'utf8')).config.custom;
  assert.equal(config.stacker_news_url, undefined, 'Stacker News is an artwork reference, not a requested footer link');
});

for (const network of networks) {
  test(`footer and error shell respect the selected networks with ${network} configured`, () => {
    const hbs = renderer();
    const site = {title: 'Test site', url: 'https://example.com', [network]: 'account'};
    for (const body of ['Home', '404', '500', '400']) {
      const html = renderTemplate(hbs, 'default.hbs', {body}, site);
      const link = new RegExp(`class="social-link" href="https://social.example/${network}"`);
      if (['twitter', 'bluesky', 'instagram'].includes(network)) assert.match(html, link);
      else assert.doesNotMatch(html, link);
      assert.ok(html.includes(body));
    }
  });
  test(`author renders ${network} without a class parameter`, () => {
    const html = renderTemplate(renderer(), 'author.hbs', {author: {name: 'Author', [network]: 'account'}, pagination: {total: 0}});
    assert.match(html, new RegExp(`class="" href="https://social.example/${network}"`));
    assert.ok(!html.includes('class="social-link"'));
    assert.doesNotMatch(html, /\bnofollow\b/, 'Footer-only link policy must not change author profiles');
  });
}

test('the complete footer order is stable for native and legacy accounts', () => {
  const custom = {
    nostr_url: 'https://example.com/nostr', bluesky_url: 'https://example.com/bluesky',
    instagram_url: 'https://example.com/instagram', telegram_url: 'https://t.me/example',
    discord_url: 'https://discord.gg/example', github_url: 'https://github.com/example',
    amboss_url: 'https://example.com/amboss', mempool_url: 'https://example.com/mempool',
    email_address: 'hello@example.com'
  };
  const expected = ['RSS', 'X', 'Nostr', 'Bluesky', 'Instagram', 'Telegram', 'Discord', 'GitHub', 'Amboss', 'Mempool.space', 'Email'];
  for (const native of [false, true]) {
    const site = native ? Object.fromEntries(networks.map(key => [key, 'account'])) : {twitter: 'account'};
    const html = renderTemplate(renderer(), 'default.hbs', {body: 'Home'}, site, null, custom);
    const group = html.match(/<div class="footer-network-links">([\s\S]*?)<\/div>/)[1];
    assert.deepEqual(Array.from(group.matchAll(/aria-label="([^"]+)"/g), match => match[1]), expected);
    for (const network of ['bluesky', 'instagram']) {
      assert.ok(group.includes(native ? `https://social.example/${network}` : custom[`${network}_url`]));
      if (native) assert.ok(!group.includes(custom[`${network}_url`]));
    }
  }
});

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

for (const [label, site, member] of [
  ['public signup', {members_enabled: true, portal_button: true}, null],
  ['invite-only signin', {members_enabled: true, portal_button: true, members_invite_only: true}, null],
  ['member account', {members_enabled: true, portal_button: true}, {name: 'Member'}]
]) {
  test(`Ghost owns the editable floating launcher for ${label}`, () => {
    const hbs = renderer();
    hbs.registerHelper('ghost_head', () => new Handlebars.SafeString('<!-- native-portal-injection -->'));
    const html = renderTemplate(hbs, 'default.hbs', {body: 'Home'}, site, member);
    assert.ok(html.includes('<!-- native-portal-injection -->'), 'Ghost must retain its injection point');
    assert.doesNotMatch(html, /class="floating-subscribe/, 'A theme clone bypasses Portal icon/text settings');
  });
}

test('floating launcher is absent when Ghost membership is disabled', () => {
  const html = renderTemplate(renderer(), 'default.hbs', {body: 'Home'}, {members_enabled: false, portal_button: true});
  assert.doesNotMatch(html, /class="floating-subscribe/);
});

test('floating launcher respects the Ghost Portal button visibility setting', () => {
  const html = renderTemplate(renderer(), 'default.hbs', {body: 'Home'}, {members_enabled: true, portal_button: false});
  assert.doesNotMatch(html, /class="floating-subscribe/);
});

test('partial escapes its caller-provided class', () => {
  const hbs = renderer();
  const html = hbs.compile('{{> "social-links" source=source social_link_class=cssClass}}')({
    source: {twitter: 'account'}, cssClass: 'social-link" onclick="alert(1)'
  });
  assert.ok(html.includes('social-link&quot; onclick&#x3D;&quot;alert(1)'));
});
