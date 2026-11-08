const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const Handlebars = require('handlebars');
const root = process.env.THEME_ROOT || path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'post.hbs'), 'utf8');
const fragment = source.match(/{{#if profile_image}}[\s\S]*?{{\/if}}/)[0];
function render(profile_image) {
  const hbs = Handlebars.create();
  const calls = [];
  hbs.registerHelper('url', () => '/author/andrea/');
  hbs.registerHelper('img_url', (image, options) => {
    calls.push({image, ...options.hash});
    const format = options.hash.format ? `/format/${options.hash.format}` : '';
    return new hbs.SafeString(`/content/images/size/w320${format}/2023/05/Andrea.png`);
  });
  return {html: hbs.compile(fragment)({profile_image, name: 'Andrea'}), calls};
}

test('author avatars offer the native WebP derivative before the original-format fallback', () => {
  const {html, calls} = render('/content/images/2023/05/Andrea.png');
  assert.match(html, /<source\s+srcset="\/content\/images\/size\/w320\/format\/webp\/2023\/05\/Andrea\.png"\s+type="image\/webp"\s*\/>/);
  assert(html.indexOf('<source') < html.indexOf('<img'));
  assert.equal(calls[0].size, 's');
  assert.equal(calls[0].format, 'webp');
});

test('avatar fallback retains the configured size, decorative alt, lazy loading and async decoding', () => {
  const {html, calls} = render('/content/images/2023/05/Andrea.png');
  assert.match(html, /<img class="author-profile-image" src="\/content\/images\/size\/w320\/2023\/05\/Andrea\.png" alt="" loading="lazy" decoding="async"/);
  const fallback = calls.find(call => !call.format);
  assert.equal(fallback.size, 's');
  assert.equal(fallback.quality, '80');
  assert(!html.includes('crossorigin'));
});

test('authors without photos keep the existing named SVG fallback without image requests', () => {
  const {html, calls} = render('');
  assert.equal(calls.length, 0);
  assert(!html.includes('<source'));
  assert(!html.includes('<img'));
  assert.match(html, /<svg[^>]*aria-hidden="true"/);
  assert.match(html, /aria-label="Andrea"/);
});
