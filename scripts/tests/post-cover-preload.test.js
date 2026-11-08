const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const Handlebars = require('handlebars');
const root = process.env.THEME_ROOT || path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'post.hbs'), 'utf8');

function render(post, rootImage) {
  const hbs = Handlebars.create();
  let head = '';
  hbs.registerHelper('contentFor', function(name, options) {
    if (name === 'head') head += options.fn(this);
    return '';
  });
  hbs.registerHelper('foreach', function(items, options) {return hbs.helpers.each.call(this, items, options);});
  hbs.registerHelper('t', value => value);
  hbs.registerHelper('img_url', (image, options) => new hbs.SafeString(`/img/${image}/${options.hash.size}`));
  hbs.registerHelper('asset', value => `/assets/${value}`);
  hbs.registerHelper('encode', value => encodeURIComponent(value || ''));
  for (const name of ['reading_time', 'date', 'url', 'post_class', 'comment_count']) hbs.registerHelper(name, () => '');
  for (const name of ['match', 'has']) hbs.registerHelper(name, function(...args) {return args.at(-1).inverse(this);});
  for (const name of ['poem-pending', 'notbyai-badge', 'recent-posts']) hbs.registerPartial(name, '');
  const icons = path.join(root, 'partials/icons');
  for (const file of fs.readdirSync(icons).filter(name => name.endsWith('.hbs'))) {
    hbs.registerPartial(`icons/${file.slice(0, -4)}`, fs.readFileSync(path.join(icons, file), 'utf8'));
  }
  hbs.registerPartial('srcset', fs.readFileSync(path.join(root, 'partials/srcset.hbs'), 'utf8'));
  // #post is a normal Handlebars object section, not a fabricated root-level post context.
  const html = hbs.compile(source)({post: {title: 'Article', authors: [], ...post}, feature_image: rootImage}, {data: {site: {}, custom: {}}});
  return {html, head};
}

test('a real post-shaped context emits its responsive cover preload into the layout head', () => {
  const {html, head} = render({feature_image: 'cover.webp'});
  assert.match(html, /class="post-cover cover"/);
  assert.match(head, /rel="preload"/);
  assert.match(head, /href="\/img\/cover.webp\/xl"/);
  assert.match(head, /imagesizes="100vw"/);
  const bodySet = html.match(/<source\s+srcset="([^"]+)"/)[1];
  const preloadSet = head.match(/imagesrcset="([^"]+)"/)[1];
  assert.equal(preloadSet, bodySet, 'Preload must select the same resource as the actual cover');
});

test('preload uses the post image rather than an unrelated root property', () => {
  const {head} = render({feature_image: 'cover.webp'}, 'wrong-root.webp');
  assert.match(head, /\/img\/cover.webp\/xl/);
  assert(!head.includes('wrong-root.webp'));
});

test('posts without a cover do not preload an image', () => {
  assert.equal(render({}).head, '');
});
