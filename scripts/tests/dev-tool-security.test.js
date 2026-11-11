const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const source = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const secret = 'sensitive-marker';

// Run the actual CLI with only filesystem, signing, and network boundaries stubbed.
async function deploy({url = 'https://ghost.example/blog/', args = ['theme.zip'], env = {}, replies = [], networkError, exists = true, responseStatus} = {}) {
  const output = [];
  const requests = [];
  let signed = 0;
  const exited = Symbol('exit');
  const state = {output, requests, exitCode: undefined};
  const context = vm.createContext({
    URL, Buffer, FormData, File,
    require(name) {
      if (name === 'node:url') return require(name);
      assert.equal(name, 'node:crypto');
      return {createHmac(...args) {signed++; return require(name).createHmac(...args);}};
    },
    process: {
      env: {GHOST_ADMIN_API_URL: url, GHOST_ADMIN_API_KEY: 'test-id:0123456789abcdef', ...env},
      argv: ['bun', 'deploy-theme.js', ...args],
      exit(code) {state.exitCode = code; throw exited;}
    },
    Bun: {file: () => ({exists: async () => exists, arrayBuffer: async () => new ArrayBuffer(0)})},
    console: {log: (...args) => output.push(args.join(' ')), error: (...args) => output.push(args.join(' '))},
    fetch: async (url, options) => {
      requests.push({url, options});
      if (networkError) throw new Error(networkError);
      assert.ok(replies.length, 'unexpected API request');
      return new Response(JSON.stringify(replies.shift()), {status: responseStatus || (requests.length === 1 ? 201 : 200)});
    }
  });
  try {
    await vm.runInContext(`(async () => {${source('deploy-theme.js').replace(/^#![^\n]*\n/, '')}\n})()`, context);
  } catch (error) {
    if (error !== exited) {
      state.error = error;
      output.push(String(error)); // Uncaught CLI errors would also be printed.
    }
  }
  return {...state, signed};
}

function hot(env = {}, startupError) {
  let config;
  const output = [];
  const exits = [];
  const signals = new Map();
  let stopped = false;
  vm.runInNewContext(source('dev-hot.js'), {
    require: () => ({create: () => ({init(options, callback) {config = options; callback(startupError);}, exit() {stopped = true;}})}),
    process: {env, exit: code => exits.push(code), on: (name, callback) => signals.set(name, callback)},
    console: {log: text => output.push(text), error: text => output.push(text)}
  });
  return {config, output, exits, signals, stopped: () => stopped};
}

test('hot proxy binds loopback while preserving proxy/assets/open/port and shutdown', () => {
  const state = hot({GHOST_DEV_URL: 'https://ghost.example/blog', DEV_HOT_PORT: '4567', DEV_HOT_OPEN: 'yes', DEV_HOT_LOCAL_ASSETS: 'off'});
  assert.equal(state.config.listen, '127.0.0.1');
  assert.equal(state.config.proxy, 'https://ghost.example/blog');
  assert.equal(state.config.port, 4567);
  assert.equal(state.config.open, true);
  assert.equal(state.config.serveStatic.length, 0);
  assert.equal(state.config.ui, false);
  state.signals.get('SIGTERM')();
  assert.equal(state.stopped(), true);
  assert.deepEqual(state.exits, [0]);
});

test('hot startup failure does not echo configured URL credentials or error secrets', () => {
  const state = hot({GHOST_DEV_URL: `http://user:${secret}@localhost:2368/?key=${secret}`}, new Error(secret));
  assert.deepEqual(state.exits, [1]);
  assert.ok(!state.output.join('\n').includes(secret));
});

for (const url of [
  `https://user:${secret}@ghost.example`,
  'https://@ghost.example',
  `https://ghost.example?token=${secret}`, `https://ghost.example/#${secret}`,
  'https://ghost.example/?', 'https://ghost.example/#',
  'http://ghost.example', 'http://127.0.0.1:2368', 'ftp://ghost.example',
  `data:text/plain,${secret}`, '   ',
  `not-a-url-${secret}`, 'https://'
]) {
  test(`invalid deployment URL is rejected before signing/network (${url.replaceAll(secret, '[redacted]')})`, async () => {
    const state = await deploy({url});
    assert.equal(state.exitCode, 1);
    assert.equal(state.signed, 0);
    assert.equal(state.requests.length, 0);
    assert.ok(!state.output.join('\n').includes(secret));
  });
}

for (const [url, base] of [
  [' https://ghost.example/blog/// ', 'https://ghost.example/blog/ghost/api/admin'],
  ['https://ghost.example/blog/ghost/api/admin/themes/', 'https://ghost.example/blog/ghost/api/admin'],
  ['https://ghost.example/a%20b/ghost/api/admin', 'https://ghost.example/a%20b/ghost/api/admin'],
  ['https://ghost.example/blog/ghost/api/administer', 'https://ghost.example/blog/ghost/api/administer/ghost/api/admin'],
  ['https://ghost.example:8443/blog', 'https://ghost.example:8443/blog/ghost/api/admin']
]) {
  test(`deploy preserves base path and encodes activation theme segment: ${url}`, async () => {
    const state = await deploy({url, replies: [{themes: [{name: 'theme /?#雪'}]}, {}]});
    assert.equal(state.error, undefined);
    assert.equal(state.requests.length, 2);
    assert.equal(state.requests[0].url, `${base}/themes/upload/`);
    assert.equal(state.requests[1].url, `${base}/themes/theme%20%2F%3F%23%E9%9B%AA/activate/`);
    assert.equal(state.requests[0].options.method, 'POST');
    assert.equal(state.requests[1].options.method, 'PUT');
    assert.match(state.requests[0].options.headers.Authorization, /^Ghost /);
    assert.equal(state.requests[0].options.headers['Accept-Version'], 'v6.0');
    assert.ok(state.requests[0].options.body.get('file') instanceof File);
  });
}

test('version override is preserved during upload and activation', async () => {
  const state = await deploy({env: {GHOST_ADMIN_API_VERSION: 'v5.0'}, replies: [{themes: [{name: 'theme'}]}, {}]});
  assert.equal(state.error, undefined);
  assert.equal(state.requests.length, 2);
  assert.equal(state.requests[0].options.headers['Accept-Version'], 'v5.0');
  assert.equal(state.requests[1].options.headers['Accept-Version'], 'v5.0');
});

test('network errors exit unsuccessfully without echoing arbitrary upstream secrets', async () => {
  const state = await deploy({networkError: `request https://user:${secret}@ghost.example?key=${secret} failed`});
  assert.equal(state.exitCode, 1);
  assert.equal(state.requests.length, 1);
  assert.ok(!state.output.join('\n').includes(secret));
});

test('HTTP errors retain status but discard arbitrary bodies/statusText', async () => {
  const context = vm.createContext({URL, Buffer, require});
  vm.runInContext(source('deploy-theme.js').slice(source('deploy-theme.js').indexOf('function printUsage')), context);
  context.response = {ok: false, status: 401, statusText: secret, text: async () => JSON.stringify({errors: [{message: secret}]})};
  await assert.rejects(vm.runInContext('parseResponse(response)', context), error => /401/.test(error.message) && !error.message.includes(secret));
});

for (const responseStatus of [401, 500]) {
  test(`HTTP ${responseStatus} prevents activation and never echoes error payload secrets`, async () => {
    const state = await deploy({responseStatus, replies: [{errors: [{message: `https://user:${secret}@ghost.example`}]}]});
    assert.equal(state.exitCode, 1);
    assert.equal(state.requests.length, 1);
    assert.ok(!state.output.join('\n').includes(secret));
  });
}

for (const options of [{args: ['--help']}, {args: ['-h']}, {args: []}, {env: {GHOST_ADMIN_API_KEY: ''}}, {exists: false}]) {
  test(`existing CLI early exit remains safe: ${JSON.stringify(options)}`, async () => {
    const state = await deploy(options);
    assert.equal(state.exitCode, options.args?.[0]?.includes('h') ? 0 : 1);
    assert.equal(state.requests.length, 0);
    assert.equal(state.signed, 0);
  });
}

test('missing upload theme name still fails without activation', async () => {
  const state = await deploy({replies: [{}]});
  assert.equal(state.exitCode, 1);
  assert.equal(state.requests.length, 1);
});
