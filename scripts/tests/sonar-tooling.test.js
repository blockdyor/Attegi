const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {spawn, spawnSync} = require('node:child_process');
const {test} = require('node:test');
const Handlebars = require('handlebars');

const root = path.resolve(__dirname, '../..');
const source = name => fs.readFileSync(path.join(root, 'scripts', name), 'utf8');

function previewContext() {
  const hbs = Handlebars.create();
  const context = vm.createContext({
    require(name) {
      if (name === 'handlebars') return hbs;
      if (name === 'browser-sync') return {create: () => ({})};
      if (name === 'http') return {createServer: () => ({listen() {}})};
      return require(name);
    },
    process: {cwd: () => root, env: {GHOST_CONTENT_API_URL: 'https://ghost.example', GHOST_CONTENT_API_KEY: 'test'}, on() {}},
    console, URL, Buffer
  });
  vm.runInContext(source('dev-preview.js'), context);
  return {context, hbs};
}

const {context: preview, hbs} = previewContext();
function evaluate(expression, timeout = 1000) {
  return vm.runInContext(expression, preview, {timeout});
}

// Execute the real declarations without the upload/activation entry point.
const deploy = vm.createContext({Buffer, require});
vm.runInContext(source('deploy-theme.js').slice(source('deploy-theme.js').indexOf('function printUsage')), deploy);

for (const [input, expected] of [
  [' https://ghost.example/blog/// ', 'https://ghost.example/blog/ghost/api/admin'],
  ['https://ghost.example/ghost/api/admin/themes/', 'https://ghost.example/ghost/api/admin'],
  ['https://ghost.example/ghost/api/admin', 'https://ghost.example/ghost/api/admin']
]) {
  test(`deploy normalizes ${input}`, () => {
    deploy.input = input;
    assert.equal(vm.runInContext('normalizeAdminApiUrl(input)', deploy), expected);
  });
}

test('deploy URL suffix and base64 padding handling stay linear on long input', () => {
  deploy.input = `https://ghost.example/${'/'.repeat(100000)}tail`;
  assert.equal(vm.runInContext('normalizeAdminApiUrl(input)', deploy, {timeout: 1000}), `${deploy.input}/ghost/api/admin`);
  assert.equal(vm.runInContext('base64url("f")', deploy), 'Zg');
  assert.equal(vm.runInContext('base64url("fo")', deploy), 'Zm8');
  assert.equal(vm.runInContext('base64url("foo")', deploy), 'Zm9v');
  assert.equal(vm.runInContext('base64url(Buffer.from([251, 255]))', deploy), '-_8');
});

test('preview normalizes long URLs and route slash runs without rescanning suffixes', () => {
  preview.longUrl = `ghost.example/${'/'.repeat(100000)}tail`;
  assert.equal(evaluate('normalizeUrl(longUrl)'), `https://${preview.longUrl}`);
  preview.longPath = `/${'/'.repeat(100000)}tail`;
  assert.equal(evaluate('normalizePathname(longPath)'), preview.longPath);
  assert.equal(evaluate('normalizeUrl(" https://ghost.example/blog/// ")'), 'https://ghost.example/blog');
  assert.equal(evaluate('normalizePathname("/tag/news///")'), '/tag/news');
  assert.equal(evaluate('normalizePathname("////")'), '/');
});

test('preview strips complete tags but preserves empty and unfinished markup', () => {
  assert.equal(evaluate('stripHtml("Hello <b>world</b> <> <<em> end <unfinished")'), 'Hello  world  <>   end <unfinished');
  preview.html = '<'.repeat(100000);
  assert.equal(evaluate('stripHtml(html)'), preview.html);
});

test('preview slug boundaries handle long separators and preserve navigation names', () => {
  preview.label = `Hello${'!'.repeat(100000)}`;
  assert.equal(evaluate('slugify(label)'), 'hello');
  assert.equal(evaluate('slugify(" --Hello, WORLD!-- ")'), 'hello-world');
  assert.equal(evaluate('slugify("!!!")'), '');
});

test('post and page models render identical local and canonical URL shapes', () => {
  for (const page of [false, true]) {
    const model = evaluate(`decoratePost({slug: 'hello-world', html: '<p>Hello</p>'}, 'https://ghost.example/blog/', ${page})`);
    const html = hbs.compile('<a href="{{url}}">{{url absolute=true}}</a>')(model);
    assert.equal(html, '<a href="/hello-world/">https://ghost.example/hello-world/</a>');
    assert.equal(model.canonical_url, 'https://ghost.example/hello-world/');
  }
});

function runner({streamFailure, exitFailure = false, shutdownFailure = false, spawnFailure = false, holdExit = false} = {}) {
  const events = new Map();
  const output = [];
  const exits = [];
  const children = [];
  const context = vm.createContext({
    Bun: {spawn() {
      if (spawnFailure && children.length === 1) throw new Error('spawn unavailable');
      let resolve;
      let reject;
      const exited = new Promise((yes, no) => {resolve = yes; reject = no;});
      const proc = {
        stdout: new ReadableStream({start(controller) {
          if (streamFailure === 'stdout') controller.error(new Error('broken stream'));
          else controller.close();
        }}),
        stderr: streamFailure === 'stderr' ? new ReadableStream({start(controller) {
          controller.error(new Error('broken stream'));
        }}) : null,
        exited,
        kill(signal) {proc.signal = signal; if (!holdExit) resolve(0);},
        resolve, reject
      };
      children.push(proc);
      return proc;
    }},
    process: {
      argv: ['bun', 'dev.js'], execPath: process.execPath, cwd: () => root, env: {},
      stdout: {write: text => output.push(text)}, stderr: {write: text => output.push(text)},
      on: (name, callback) => events.set(name, callback),
      exit: code => {exits.push(code);}
    },
    console: {error: (...args) => output.push(args.join(' '))}, TextDecoderStream
  });
  vm.runInContext(source('dev.js'), context);
  if (shutdownFailure) vm.runInContext('shutdown = async () => {throw new Error("shutdown failed");}', context);
  if (exitFailure) children[0].reject(new Error('wait failed'));
  return {events, output, exits, children};
}

const flush = () => new Promise(resolve => setTimeout(resolve, 20));

for (const streamFailure of ['stdout', 'stderr']) {
  test(`dev ${streamFailure} failure reports an error and terminates every watcher unsuccessfully`, async () => {
    const state = runner({streamFailure});
    await flush();
    assert.deepEqual(state.exits, [1]);
    assert.ok(state.children.every(child => child.signal === 'SIGTERM'));
    assert.match(state.output.join(''), /broken stream/);
  });
}

test('dev rejected child wait terminates siblings with a nonzero exit', async () => {
  const state = runner({exitFailure: true});
  await flush();
  assert.deepEqual(state.exits, [1]);
  assert.ok(state.children.every(child => child.signal === 'SIGTERM'));
  assert.match(state.output.join(''), /wait failed/);
});

test('dev spawn failure is reported and cannot leave started watchers running', async () => {
  const state = runner({spawnFailure: true});
  await flush();
  assert.deepEqual(state.exits, [1]);
  assert.match(state.output.join(''), /spawn unavailable/);
  assert.equal(state.children[0].signal, 'SIGTERM');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  test(`dev ${signal} awaits child shutdown and exits successfully`, async () => {
    const state = runner({holdExit: true});
    state.events.get(signal)();
    await flush();
    assert.deepEqual(state.exits, []);
    for (const child of state.children) child.resolve(0);
    await flush();
    assert.deepEqual(state.exits, [0]);
    assert.ok(state.children.every(child => child.signal === signal));
  });
  test(`dev ${signal} reports rejected shutdown and exits unsuccessfully`, async () => {
    const state = runner({shutdownFailure: true});
    state.events.get(signal)();
    await flush();
    assert.deepEqual(state.exits, [1]);
    assert.match(state.output.join(''), /shutdown failed/);
  });
}

for (const code of [0, 7]) {
  test(`dev child exit ${code} terminates sibling watchers and preserves status`, async () => {
    const state = runner();
    state.children[0].resolve(code);
    await flush();
    assert.deepEqual(state.exits, [code]);
    assert.ok(state.children.every(child => child.signal === 'SIGTERM'));
  });
  test(`dev child exit ${code} reports rejected shutdown and exits unsuccessfully`, async () => {
    const state = runner({shutdownFailure: true});
    state.children[0].resolve(code);
    await flush();
    assert.deepEqual(state.exits, [1]);
    assert.match(state.output.join(''), /shutdown failed/);
    assert.ok(state.children.every(child => child.signal === 'SIGTERM'));
  });
}

test('dev child wait failure during successful shutdown changes the final status to failure', async () => {
  const state = runner({holdExit: true});
  state.children[0].resolve(0);
  await flush();
  assert.deepEqual(state.exits, []);
  state.children[1].reject(new Error('late wait failed'));
  await flush();
  assert.deepEqual(state.exits, [1]);
  assert.match(state.output.join(''), /late wait failed/);
});

test('real dev CLI forwards child status and stops the sibling watcher', async () => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'sonar-dev-'));
  try {
    fs.writeFileSync(path.join(dir, 'watcher.js'), `
      const fs = require('node:fs');
      if (process.argv[2] === 'watch') {
        fs.writeFileSync('watcher.pid', String(process.pid));
        console.log('watcher ready');
        process.on('SIGTERM', () => {fs.writeFileSync('stopped', 'yes'); process.exit(0);});
        setInterval(() => {}, 1000);
      } else {
        const timer = setInterval(() => {
          if (fs.existsSync('watcher.pid')) {clearInterval(timer); process.exit(Number(process.argv[2]));}
        }, 20);
      }
    `);
    for (const code of [0, 7]) {
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({scripts: {
        'css:sass:watch': `bun watcher.js ${code}`, 'js:watch': 'bun watcher.js watch'
      }}));
      const child = spawn(process.execPath, [path.join(root, 'scripts/dev.js')], {cwd: dir, stdio: ['ignore', 'pipe', 'pipe']});
      let output = '';
      child.stdout.on('data', chunk => {output += chunk;});
      child.stderr.on('data', chunk => {output += chunk;});
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
      let status;
      try {status = await new Promise((resolve, reject) => {child.on('error', reject); child.on('exit', resolve);});}
      finally {clearTimeout(timer);}
      assert.equal(status, code, output);
      assert.match(output, /\[js\].*watcher ready/);
      assert.equal(fs.readFileSync(path.join(dir, 'stopped'), 'utf8'), 'yes');
      fs.unlinkSync(path.join(dir, 'watcher.pid'));
      fs.unlinkSync(path.join(dir, 'stopped'));
    }
  } finally {
    const pidFile = path.join(dir, 'watcher.pid');
    if (fs.existsSync(pidFile)) {
      try {process.kill(Number(fs.readFileSync(pidFile, 'utf8')), 'SIGKILL');} catch {}
    }
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('bump CLI preserves missing, bump, explicit and declined argument behavior', () => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'sonar-bump-'));
  try {
    for (const [args, input, status, expected] of [
      [[], '', 1, '1.2.3'], [[''], '', 1, '1.2.3'],
      [['patch'], 'y', 0, '1.2.4'], [['minor'], 'Y', 0, '1.3.0'],
      [['major'], 'y', 0, '2.0.0'], [['4.5.6'], 'y', 0, '4.5.6'],
      [['patch'], 'n', 1, '1.2.3']
    ]) {
      fs.writeFileSync(path.join(dir, 'package.json'), '{"version":"1.2.3"}');
      const result = spawnSync('bash', [path.join(root, 'scripts/bump-version.sh'), ...args], {cwd: dir, input, encoding: 'utf8'});
      assert.equal(result.status, status, result.stderr);
      assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version, expected);
    }
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});
