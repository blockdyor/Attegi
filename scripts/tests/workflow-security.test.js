const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {test} = require('node:test');

const root = path.resolve(__dirname, '../..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const workflows = ['build.yml', 'release.yml', 'deploy.yml'].map(name =>
  fs.readFileSync(path.join(root, '.github/workflows', name), 'utf8'));

for (const [index, workflow] of workflows.entries()) {
  test(`workflow ${index + 1} pins actions and scanner and disables install scripts`, () => {
    for (const match of workflow.matchAll(/uses:\s+([^\s#]+)/g)) {
      assert.match(match[1], /^[\w-]+\/[\w-]+@[a-f0-9]{40}$/);
    }
    for (const match of workflow.matchAll(/bun install([^\n]*)/g)) {
      assert.match(match[1], /--frozen-lockfile/);
      assert.match(match[1], /--ignore-scripts/);
    }
    for (const match of workflow.matchAll(/bunx gscan([^\s]*)/g)) {
      assert.match(match[1], /^@\d+\.\d+\.\d+$/);
    }
  });
}

function releaseStep(name) {
  const step = workflows[1].split('      - name: ').find(value => value.startsWith(`${name}\n`));
  assert.ok(step, `Missing release step: ${name}`);
  return step.split('        run: |\n')[1].split('\n').map(line => line.slice(10)).join('\n');
}

function runStep(script, env, gitFixture = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'attegi-workflow-'));
  try {
    const output = path.join(dir, 'output');
    const marker = path.join(dir, 'injected');
    if (gitFixture) {
      for (const args of [
        ['init', '--quiet', dir],
        ['-C', dir, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '--allow-empty', '-m', 'Fixture'],
        ['-C', dir, 'tag', 'v6.12.3']
      ]) {
        assert.equal(spawnSync('git', args).status, 0);
      }
    }
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
      cwd: gitFixture ? dir : root,
      env: {...process.env, GITHUB_OUTPUT: output, ...env(marker)},
      encoding: 'utf8'
    });
    return {status: result.status, output: fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '', injected: fs.existsSync(marker)};
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

test('release inputs never appear as executable workflow expressions', () => {
  for (const name of ['Get version', 'Get previous tag']) {
    assert.doesNotMatch(releaseStep(name), /\$\{\{[\s\S]*?\}\}/);
  }
});

test('release version accepts numeric versions and rejects shell and output injection', () => {
  const script = releaseStep('Get version');
  const valid = runStep(script, () => ({RELEASE_VERSION: version}));
  assert.equal(valid.status, 0);
  assert.equal(valid.output, `version=${version}\ntag=v${version}\n`);
  for (const value of ['1.2.3', '1.2.3\ninjected=true', 'invalid', '$(touch MARKER)', '1.2.3"; touch MARKER; #']) {
    const result = runStep(script, marker => ({RELEASE_VERSION: value.replace('MARKER', marker)}));
    assert.notEqual(result.status, 0);
    assert.equal(result.output, '');
    assert.equal(result.injected, false);
  }
});

test('release refuses to overwrite an existing tag with a newly built archive', () => {
  const script = releaseStep('Check if tag exists');
  const existing = runStep(script, () => ({RELEASE_TAG: 'v6.12.3'}), true);
  assert.notEqual(existing.status, 0);
  const fresh = runStep(script, () => ({RELEASE_TAG: 'v6.12.4'}), true);
  assert.equal(fresh.status, 0);
  assert.equal(fresh.output, 'exists=false\n');
});

test('previous release tag must be an existing valid tag and cannot execute shell input', () => {
  const script = releaseStep('Get previous tag');
  const valid = runStep(script, () => ({PREVIOUS_TAG: 'v6.12.3'}), true);
  assert.equal(valid.status, 0);
  assert.equal(valid.output, 'tag=v6.12.3\n');
  for (const value of ['--help', 'v6.12.3\ninjected=true', 'nonexistent-tag', '$(touch MARKER)']) {
    const result = runStep(script, marker => ({PREVIOUS_TAG: value.replace('MARKER', marker)}), true);
    assert.notEqual(result.status, 0);
    assert.equal(result.output, '');
    assert.equal(result.injected, false);
  }
});
