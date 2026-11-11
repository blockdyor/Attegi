const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {test} = require('node:test');

const root = process.env.THEME_ROOT || path.resolve(__dirname, '../..');
const files = JSON.parse(fs.readFileSync(path.join(root, 'scripts/theme-files.json'), 'utf8'));
const bun = process.versions.bun ? process.execPath : 'bun';

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'attegi-package-security-'));
  const dir = path.join(base, 'theme');
  fs.mkdirSync(dir);
  for (const name of files) {
    const dest = path.join(dir, name);
    if (name.endsWith('/')) fs.mkdirSync(dest, {recursive: true});
    else {
      fs.mkdirSync(path.dirname(dest), {recursive: true});
      fs.writeFileSync(dest, name === 'package.json' ? JSON.stringify({name: 'attegi', version: '6.12.11'}) : 'test fixture\n');
    }
  }
  t.after(() => fs.rmSync(base, {recursive: true, force: true}));
  return {base, dir, zip: path.join(dir, 'dist/attegi.zip')};
}

function run(state) {
  return spawnSync(bun, [path.join(root, 'scripts/compress.js')], {cwd: state.dir, encoding: 'utf8', timeout: 15000});
}

function entries(filename) {
  const data = fs.readFileSync(filename);
  const end = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, 'Actual archive has an end-of-central-directory record');
  const count = data.readUInt16LE(end + 10);
  let offset = data.readUInt32LE(end + 16);
  const names = [];
  for (let i = 0; i < count; i++) {
    assert.equal(data.readUInt32LE(offset), 0x02014b50);
    const size = data.readUInt16LE(offset + 28);
    names.push(data.toString('utf8', offset + 46, offset + 46 + size));
    offset += 46 + size + data.readUInt16LE(offset + 30) + data.readUInt16LE(offset + 32);
  }
  return names.sort();
}

function priorZip(state) {
  fs.mkdirSync(path.dirname(state.zip), {recursive: true});
  fs.writeFileSync(state.zip, 'prior-output-sentinel');
}

test('package contains only the explicit approved theme manifest, not unrelated local files', t => {
  const state = fixture(t);
  for (const name of ['credentials.json', 'backup.sql', 'assets/img/admin-key.pem', 'assets/img/untracked.png']) {
    fs.writeFileSync(path.join(state.dir, name), 'PRIVATE-TEST-FIXTURE');
  }
  const result = run(state);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(entries(state.zip), files.slice().sort());
});

for (const name of ['assets', 'assets/js/post.js']) {
  test(`selected symlink ${name} is rejected before replacing existing output`, t => {
    const state = fixture(t);
    const target = path.join(state.dir, name);
    fs.rmSync(target, {recursive: true, force: true});
    const outside = path.join(state.base, 'outside');
    if (name === 'assets') fs.mkdirSync(outside);
    else fs.writeFileSync(outside, 'PRIVATE-TEST-FIXTURE');
    fs.symlinkSync(outside, target);
    priorZip(state);
    const result = run(state);
    assert.notEqual(result.status, 0, 'Never archive selected symlinks');
    assert.equal(fs.readFileSync(state.zip, 'utf8'), 'prior-output-sentinel');
  });
}

test('malformed package identity cannot unlink or overwrite outside dist', t => {
  const state = fixture(t);
  const victim = path.join(state.base, 'victim.zip');
  fs.writeFileSync(victim, 'outside-sentinel');
  fs.writeFileSync(path.join(state.dir, 'package.json'), JSON.stringify({name: '../../victim', version: '6.12.11'}));
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.equal(fs.readFileSync(victim, 'utf8'), 'outside-sentinel');
  assert.equal(fs.existsSync(state.zip), false);
});

test('symlinked dist does not redirect writes outside the theme', t => {
  const state = fixture(t);
  const outside = path.join(state.base, 'outside');
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.dirname(state.zip));
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(path.join(outside, 'attegi.zip')), false);
});

test('missing required theme file fails closed and preserves the previous ZIP', t => {
  const state = fixture(t);
  fs.unlinkSync(path.join(state.dir, 'post.hbs'));
  priorZip(state);
  const result = run(state);
  assert.notEqual(result.status, 0);
  assert.equal(fs.readFileSync(state.zip, 'utf8'), 'prior-output-sentinel');
});
