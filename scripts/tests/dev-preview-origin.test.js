const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {test, before, after} = require('node:test');

let root;
let preview;
let ghost;
let other;
let previewUrl;
let otherUrl;
let otherRequests = 0;
let loopRequests = 0;

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

before(async () => {
  root = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'preview-origin-'));
  for (const dir of ['assets', 'partials', 'locales']) fs.mkdirSync(path.join(root, dir));
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  other = http.createServer((_request, response) => {
    otherRequests++;
    response.writeHead(200, {'Content-Type': 'text/css'});
    response.end('outside configured Ghost origin');
  });
  otherUrl = await listen(other);
  const locations = {'/redirect.css': '/normal.css', '/cross-origin.css': `${otherUrl}/private.css`, '/loop.css': '/loop.css'};
  ghost = http.createServer((request, response) => {
    if (Object.hasOwn(locations, request.url)) {
      if (request.url === '/loop.css') loopRequests++;
      response.writeHead(302, {Location: locations[request.url]});
      response.end();
      return;
    }
    response.writeHead(200, {'Content-Type': 'text/css'});
    response.end('trusted Ghost asset');
  });
  const ghostUrl = await listen(ghost);
  // Only startup/BrowserSync are replaced; both proxy fetches and upstream servers are real.
  const context = vm.createContext({
    require(name) {
      if (name === 'browser-sync') return {create: () => ({init() {}})};
      if (name === 'http') return {createServer(handler) {
        preview = http.createServer(handler);
        return {listen(_port, _host, callback) {callback();}};
      }};
      return require(name);
    },
    process: {cwd: () => root, env: {GHOST_CONTENT_API_URL: ghostUrl, GHOST_CONTENT_API_KEY: 'test'}, on() {}, exit() {throw new Error('Unexpected exit');}},
    console: {log() {}, error() {}}, URL, Buffer, fetch
  });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../dev-preview.js'), 'utf8'), context);
  previewUrl = await listen(preview);
});

after(async () => {
  for (const server of [preview, ghost, other]) {
    if (!server?.listening) continue;
    const closed = new Promise(resolve => server.close(resolve));
    server.closeAllConnections();
    await closed;
  }
  if (root) fs.rmSync(root, {recursive: true, force: true});
});

test('remote preview assets and same-origin redirects still load', async () => {
  for (const target of ['/normal.css', '/redirect.css']) {
    const response = await fetch(previewUrl + target);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'trusted Ghost asset');
  }
});

test('embedded absolute asset URLs cannot reach another origin', async () => {
  const before = otherRequests;
  const response = await fetch(`${previewUrl}/${otherUrl}/private.css`);
  await response.text();
  assert.equal(otherRequests, before, 'The denied origin must not receive a request');
  assert.equal(response.status, 403);
});

test('remote preview redirects cannot reach another origin', async () => {
  const before = otherRequests;
  const response = await fetch(`${previewUrl}/cross-origin.css`);
  await response.text();
  assert.equal(otherRequests, before, 'Redirect validation must happen before the next fetch');
  assert.equal(response.status, 403);
});

test('same-origin redirect loops terminate within the redirect budget', async () => {
  const before = loopRequests;
  const response = await fetch(`${previewUrl}/loop.css`);
  assert.equal(response.status, 500);
  await response.text();
  assert.ok(loopRequests - before <= 21, `Observed ${loopRequests - before} requests in one redirect chain`);
});
