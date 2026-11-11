const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {test} = require('node:test');
const {ZipArchive} = require('archiver');

const root = process.env.THEME_ROOT || path.resolve(__dirname, '../..');
const bun = process.versions.bun ? process.execPath : 'bun';
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'attegi-gscan-gate-'));
  fs.mkdirSync(path.join(dir, 'dist'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  return dir;
}
function run(dir) {
  return spawnSync(bun, [path.join(root, 'scripts/validate-theme.js')], {cwd: dir, encoding: 'utf8', timeout: 20000});
}
async function archive(dir, broken = false) {
  const pkg = {name: 'attegi', version: '6.12.11', description: 'Minimal native Ghost theme validation fixture', license: 'AGPL-3.0-only', engines: {ghost: '>=5.118.0'}, author: {name: 'Test author', email: 'test@example.invalid', url: 'https://example.invalid'}, config: {posts_per_page: 8}};
  if (broken) delete pkg.version;
  const output = fs.createWriteStream(path.join(dir, 'dist/attegi.zip'));
  const zip = new ZipArchive();
  await new Promise((resolve, reject) => {
    output.on('close', resolve); output.on('error', reject); zip.on('error', reject); zip.pipe(output);
    zip.append(JSON.stringify(pkg), {name: 'package.json'});
    zip.append(`<!doctype html><html><head><title>{{meta_title}}</title>${broken ? '' : '{{ghost_head}}'}<link rel="stylesheet" href="{{asset 'css/style.css'}}"></head><body class="{{body_class}}">{{{body}}}{{ghost_foot}}</body></html>`, {name: 'default.hbs'});
    zip.append('{{!< default}}{{#foreach posts}}{{title}}{{/foreach}}{{pagination}}', {name: 'index.hbs'});
    zip.append('{{!< default}}{{#post}}{{title}}{{content}}{{/post}}', {name: 'post.hbs'});
    zip.append('.kg-width-wide{max-width:100%}.kg-width-full{width:100%}', {name: 'assets/css/style.css'});
    zip.finalize().catch(reject);
  });
}

test('locked structured GScan accepts a real compatible Ghost ZIP', async t => {
  const dir = fixture(t); await archive(dir);
  const result = run(dir);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Your theme is compatible with Ghost 6\.x/);
});

test('malformed ZIP fails instead of trusting a successful scanner CLI exit', t => {
  const dir = fixture(t); fs.writeFileSync(path.join(dir, 'dist/attegi.zip'), 'not-a-zip');
  const result = run(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /\[Error\]/);
  assert.doesNotMatch(result.stdout, /Your theme is compatible/);
});

test('structured theme errors fail even when the archive itself is valid', async t => {
  const dir = fixture(t); await archive(dir, true);
  const result = run(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /"errors":\s*[1-9]/);
  assert.doesNotMatch(result.stdout, /Your theme is compatible/);
});
