const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {test, before, after} = require('node:test');
const Handlebars = require('handlebars');

const source = fs.readFileSync(path.resolve(__dirname, '../dev-preview.js'), 'utf8');
let root;
let server;
let port;
let preview;
let browserOptions;

before(async () => {
  root = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'preview-security-'));
  for (const dir of ['theme/assets', 'theme/partials', 'theme/locales', 'theme/assets-private']) {
    fs.mkdirSync(path.join(root, dir), {recursive: true});
  }
  for (const [file, contents] of Object.entries({
    'theme/package.json': '{}',
    'theme/assets/normal.css': 'body { color: red; }',
    'theme/assets/space name.css': 'encoded asset',
    'theme/assets-private/secret.css': 'private sibling',
    'secret.hbs': 'outside template',
    'secret.json': '{"Hello":"outside locale"}',
    'theme/index.hbs': '{{t "Hello"}} {{> card}}',
    'theme/default.hbs': '<main>{{{body}}}</main>',
    'theme/partials/card.hbs': 'local partial',
    'theme/locales/en.json': '{"Hello":"Welcome"}',
    'theme/locales/zh.json': '{"Hello":"你好"}'
  })) fs.writeFileSync(path.join(root, file), contents);
  fs.symlinkSync(path.join(root, 'secret.hbs'), path.join(root, 'theme/assets/leak.css'));
  fs.symlinkSync(path.join(root, 'theme/assets-private'), path.join(root, 'theme/assets/leak-dir'));
  fs.symlinkSync(path.join(root, 'theme/assets/normal.css'), path.join(root, 'theme/assets/local.css'));

  // Only startup and the remote API are replaced; handlers, filesystem and rendering stay real.
  let startPreview;
  const context = vm.createContext({
    require(name) {
      if (name === 'handlebars') return Handlebars.create();
      if (name === 'browser-sync') return {create: () => ({init: options => {browserOptions = options;}})};
      if (name === 'http') return {createServer: handler => {
        server = http.createServer(handler);
        return {listen(_port, _host, callback) {startPreview = callback;}, close: callback => server.close(callback)};
      }};
      return require(name);
    },
    process: {cwd: () => path.join(root, 'theme'), env: {
      GHOST_CONTENT_API_URL: 'https://ghost.example', GHOST_CONTENT_API_KEY: 'test'
    }, on() {}, exit() {throw new Error('Unexpected exit');}},
    console: {log() {}, error() {}}, URL, Buffer,
    fetch: async url => {
      const pathname = new URL(url).pathname;
      if (pathname.endsWith('/settings/')) return {ok: true, json: async () => ({settings: {locale: 'en'}})};
      if (pathname.endsWith('/posts/')) return {ok: true, json: async () => ({posts: [], meta: {pagination: {}}})};
      return {ok: true, status: 200, headers: new Map([['content-type', 'text/css']]),
        arrayBuffer: async () => Buffer.from('remote asset')};
    }
  });
  vm.runInContext(`${source}\n;globalThis.preview = {compileTemplate, serveAsset, registerPartials, getLocaleMessages};`, context);
  preview = context.preview;
  startPreview();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

after(async () => {
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  if (root) fs.rmSync(root, {recursive: true, force: true});
});

function request(target) {
  return new Promise((resolve, reject) => {
    // Send the exact request target: Bun's HTTP client normalizes dot segments away.
    const socket = require('node:net').connect(port, '127.0.0.1', () => {
      socket.write(`GET ${target} HTTP/1.0\r\nHost: localhost\r\n\r\n`);
    });
    let raw = '';
    socket.setEncoding('utf8');
    socket.on('data', chunk => {raw += chunk;});
    socket.on('end', () => {
      const boundary = raw.indexOf('\r\n\r\n');
      resolve({status: Number(raw.split(' ')[1]), body: raw.slice(boundary + 4)});
    });
    socket.on('error', reject);
  });
}

for (const name of ['../secret', '..\\secret', '/secret', 'index/../../secret', '%2e%2e/secret', 'constructor', '__proto__']) {
  test(`template reader rejects non-theme name ${name}`, () => {
    assert.throws(() => preview.compileTemplate(name), /Forbidden/);
  });
}

test('template reader rejects an allowlisted template symlink outside the theme', () => {
  const file = path.join(root, 'theme/page.hbs');
  fs.symlinkSync(path.join(root, 'secret.hbs'), file);
  try { assert.throws(() => preview.compileTemplate('page'), /Forbidden/); }
  finally { fs.unlinkSync(file); }
});

for (const target of [
  '/assets/../assets-private/secret.css',
  '/assets/%2e%2e/assets-private/secret.css',
  '/assets/..%2fassets-private/secret.css',
  '/assets/%2e%2e%5cassets-private/secret.css',
  '/assets/%252e%252e%252fsecret.css',
  '/assets/leak.css', '/assets/leak-dir/secret.css', '/assets/%00.css', '/assets/%zz.css'
]) {
  test(`HTTP rejects unsafe asset path ${target}`, async () => {
    const result = await request(target);
    assert.ok([400, 403].includes(result.status), JSON.stringify(result));
    assert.doesNotMatch(result.body, /outside template|private sibling/);
  });
}

test('direct asset handler rejects sibling-prefix traversal', async () => {
  let status;
  const response = new (require('node:stream').Writable)({write(_chunk, _encoding, callback) {callback();}});
  response.writeHead = value => {status = value;};
  const finished = new Promise(resolve => response.on('finish', resolve));
  preview.serveAsset('/assets/../assets-private/secret.css', response);
  await finished;
  assert.equal(status, 403);
});

test('valid assets, encoded names, internal symlinks and remote assets still load', async () => {
  for (const [target, body] of [
    ['/assets/normal.css?v=1', 'body { color: red; }'],
    ['/assets/space%20name.css', 'encoded asset'],
    ['/assets/local.css', 'body { color: red; }'],
    ['/public/cards.min.css', 'remote asset']
  ]) {
    assert.deepEqual(await request(target), {status: 200, body});
  }
  assert.equal((await request('/assets/missing.css')).status, 404);
  assert.equal((await request('/assets/')).status, 404);
});

test('normal preview renders local templates, partials and translations', async () => {
  assert.deepEqual(await request('/'), {status: 200, body: '<main>Welcome local partial</main>'});
  assert.equal(preview.getLocaleMessages('zh-CN').Hello, '你好');
});

test('remote locale cannot traverse outside locales', () => {
  assert.equal(preview.getLocaleMessages('../../secret').Hello, 'Welcome');
});

test('locale symlink cannot read outside locales', () => {
  fs.symlinkSync(path.join(root, 'secret.json'), path.join(root, 'theme/locales/xx.json'));
  assert.throws(() => preview.getLocaleMessages('xx'), /Forbidden/);
});

test('partial symlink cannot read outside partials', () => {
  const file = path.join(root, 'theme/partials/escape.hbs');
  fs.symlinkSync(path.join(root, 'secret.hbs'), file);
  try { assert.throws(() => preview.registerPartials(), /Forbidden/); }
  finally { fs.unlinkSync(file); }
});

test('BrowserSync preview only listens on loopback', () => {
  assert.equal(browserOptions.listen, '127.0.0.1');
  assert.equal(browserOptions.online, false);
});
