const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {test} = require('node:test');
const root = path.resolve(__dirname, '../..');
const workflows = Object.fromEntries(['build', 'release', 'deploy'].map(name => {
  const result = spawnSync('bun', ['-e', 'console.log(JSON.stringify(Bun.YAML.parse(await Bun.file(process.argv[1]).text())))', path.join(root, `.github/workflows/${name}.yml`)], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  return [name, JSON.parse(result.stdout)];
}));

for (const [name, workflow] of Object.entries(workflows)) {
  test(`${name}: read-only defaults, credential-free checkouts, frozen validation`, () => {
    assert.deepEqual(workflow.permissions, {contents: 'read'});
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      if (job.permissions?.contents === 'write') assert.equal(jobName, 'publish');
      for (const step of job.steps) {
        if (step.uses?.startsWith('actions/checkout@')) assert.equal(step.with?.['persist-credentials'], false);
        if (step.run) {
          assert.doesNotMatch(step.run, /\$\{\{/);
          assert.doesNotMatch(step.run, /bunx\s+gscan/);
          const syntax = spawnSync('bash', ['-n'], {input: step.run, encoding: 'utf8'});
          assert.equal(syntax.status, 0, `${name}/${step.name}: ${syntax.stderr}`);
        }
      }
      if (job.steps.some(step => step.run?.includes('bun run compress'))) {
        assert.ok(job.steps.some(step => step.run === 'bun scripts/validate-theme.js'));
        assert.notEqual(job.permissions?.contents, 'write');
      }
    }
  });
}

for (const name of ['build', 'release']) {
  test(`${name}: write job only publishes a successfully validated artifact`, () => {
    const workflow = workflows[name];
    const publish = workflow.jobs.publish;
    assert.ok(publish, 'separate publish job');
    assert.deepEqual(publish.permissions, {contents: 'write'});
    assert.equal(publish.needs, 'build');
    assert.match(publish.if, /needs\.build\.result == 'success'/);
    assert.doesNotMatch(publish.if, /always\(|!cancelled\(/);
    assert.match(publish.if, name === 'build' ? /startsWith\(github.ref, 'refs\/tags\/v'\)/ : /github.ref == 'refs\/heads\/main'/);
    assert.ok(publish.steps.some(step => step.uses?.startsWith('actions/download-artifact@')));
    for (const step of publish.steps) {
      assert.ok(!step.uses || /^(actions\/download-artifact|softprops\/action-gh-release)@/.test(step.uses));
      assert.doesNotMatch(step.run || '', /\b(?:bun|npm|node|yarn|pnpm)\b|git checkout|git clone|\bsource\b/);
    }
    const guard = publish.steps.find(step => step.name === 'Recheck publication source');
    assert.ok(guard);
    assert.match(guard.run, /refs\/heads\/main/);
    assert.match(guard.run, /SOURCE_SHA/);
    assert.match(guard.run, /RELEASE_TAG/);
    assert.ok(workflow.jobs.build.steps.some(step => step.name === 'Validate publication source'));
  });
}

for (const name of ['build', 'release']) {
  test(`${name}: metadata rejects CR/LF output injection before writing outputs`, () => {
    const script = workflows[name].jobs[workflows[name].jobs.build ? 'build' : 'release'].steps.find(step => step.name === 'Extract package info').run;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'attegi-metadata-'));
    try {
      fs.mkdirSync(path.join(dir, 'dist'));
      fs.writeFileSync(path.join(dir, 'dist/attegi.zip'), 'fixture');
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
      const validOutput = path.join(dir, 'valid-output');
      const valid = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {cwd: dir, env: {...process.env, GITHUB_OUTPUT: validOutput}, encoding: 'utf8'});
      assert.equal(valid.status, 0, valid.stderr);
      assert.match(fs.readFileSync(validOutput, 'utf8'), /^version=[0-9]+\.[0-9]+\.[0-9]+\nname=attegi\n/);
      for (const field of ['description', 'demo', 'name', 'version', 'license', 'ghost']) {
        for (const newline of ['\n', '\r']) {
          const fixture = structuredClone(pkg);
          if (field === 'ghost') fixture.engines.ghost += `${newline}injected=true`;
          else fixture[field] += `${newline}injected=true`;
          fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(fixture));
          const output = path.join(dir, 'output');
          fs.rmSync(output, {force: true});
          const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {cwd: dir, env: {...process.env, GITHUB_OUTPUT: output}, encoding: 'utf8'});
          assert.notEqual(result.status, 0, `${field} rejects ${JSON.stringify(newline)}`);
          assert.equal(fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '', '');
        }
      }
    } finally { fs.rmSync(dir, {recursive: true, force: true}); }
  });
}

test('manual release and secret-bearing deployment reject non-main dispatches', () => {
  assert.ok(workflows.release.jobs.build, 'manual release has a separate build job');
  assert.equal(workflows.release.jobs.build.if, "github.ref == 'refs/heads/main'");
  assert.equal(workflows.deploy.jobs.build.if, "github.ref == 'refs/heads/main'");
  for (const name of ['deploy-dev', 'deploy-prod']) {
    const job = workflows.deploy.jobs[name];
    assert.match(job.if, /github.ref == 'refs\/heads\/main'/);
    assert.equal(job.environment, name.slice(7));
    for (const step of job.steps) assert.doesNotMatch(step.run || '', /secrets\./);
  }
});

test('tag publication source requires numeric matching version and the exact main commit', () => {
  const script = workflows.build.jobs.build.steps.find(step => step.name === 'Validate publication source')?.run;
  assert.ok(script, 'tag/source validation exists');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'attegi-source-'));
  try {
    const git = args => {
      const result = spawnSync('git', args, {cwd: dir, encoding: 'utf8'});
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.trim();
    };
    git(['init', '--quiet']);
    git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '--allow-empty', '-m', 'Fixture']);
    const sha = git(['rev-parse', 'HEAD']);
    git(['update-ref', 'refs/remotes/origin/main', sha]);
    git(['tag', 'v1.2.3']);
    const run = env => spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {cwd: dir, env: {...process.env, GITHUB_REF: 'refs/tags/v1.2.3', GITHUB_SHA: sha, PACKAGE_VERSION: '1.2.3', ...env}, encoding: 'utf8'});
    assert.equal(run({}).status, 0);
    const manualScript = workflows.release.jobs.build.steps.find(step => step.name === 'Validate publication source').run;
    const manual = env => spawnSync('bash', ['-e', '-o', 'pipefail', '-c', manualScript], {cwd: dir, env: {...process.env, GITHUB_REF: 'refs/heads/main', GITHUB_SHA: sha, ...env}, encoding: 'utf8'});
    assert.equal(manual({}).status, 0);
    for (const ref of ['refs/heads/feature', 'refs/tags/v1.2.3', 'refs/heads/main\ninjected=true']) assert.notEqual(manual({GITHUB_REF: ref}).status, 0);
    assert.notEqual(manual({GITHUB_SHA: '0'.repeat(40)}).status, 0);
    for (const ref of ['refs/tags/other', 'refs/tags/v1.2.4', 'refs/tags/v1.2.3\ninjected=true', 'refs/tags/v1.2.3-rc1']) assert.notEqual(run({GITHUB_REF: ref}).status, 0);
    assert.notEqual(run({PACKAGE_VERSION: '1.2.3\ninjected=true'}).status, 0);
    assert.notEqual(run({GITHUB_SHA: '0'.repeat(40)}).status, 0);
    git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '--allow-empty', '-m', 'Untrusted']);
    assert.notEqual(run({GITHUB_SHA: git(['rev-parse', 'HEAD'])}).status, 0);
    assert.equal(run({GITHUB_REF: 'refs/heads/feature'}).status, 0, 'ordinary builds remain allowed, without publication');
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});
