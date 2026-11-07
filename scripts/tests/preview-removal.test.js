const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {test} = require('node:test');
const root = path.resolve(__dirname, '../..');

test('retired preview server has no executable or package entry points', () => {
  const {scripts} = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(fs.existsSync(path.join(root, 'scripts/dev-preview.js')), false);
  assert.equal(Object.hasOwn(scripts, 'serve:preview'), false);
  assert.equal(Object.hasOwn(scripts, 'dev:preview'), false);
  assert.equal(scripts['dev:hot'], 'bun scripts/dev.js hot');
  assert.equal(scripts['serve:hot'], 'bun scripts/dev-hot.js');
  assert.equal(scripts.dev, 'bun scripts/dev.js');
});

test('retired preview CLI fails before starting any watcher', () => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'retired-preview-'));
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), '{"private":true,"scripts":{}}');
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/dev.js'), 'preview'], {
      cwd: dir, encoding: 'utf8', timeout: 5000
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unknown dev mode:/);
    assert.match(result.stderr, /Use one of: css, default, hot/);
    assert.doesNotMatch(result.stdout + result.stderr, /\[(?:sass|js|preview)\]/);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});
