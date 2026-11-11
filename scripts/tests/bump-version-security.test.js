const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {test} = require('node:test');

const script = path.resolve(__dirname, '../bump-version.sh');

function runVersion(current, requested, check) {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'bump-security-'));
  try {
    const file = path.join(dir, 'package.json');
    const original = JSON.stringify({name: 'fixture', version: current});
    fs.writeFileSync(file, original);
    const result = spawnSync('bash', [script, requested], {
      cwd: dir, input: 'y', encoding: 'utf8', timeout: 5000,
      env: {...process.env, PATH: `${path.dirname(process.execPath)}:${process.env.PATH}`}
    });
    assert.equal(result.error, undefined);
    assert.equal(fs.existsSync(path.join(dir, 'injected')), false, 'version input executed code');
    check(result, fs.readFileSync(file, 'utf8'), original);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

const malformed = [
  '', '1.2', '1.2.3.4', 'v1.2.3', '1.2.3-beta', '1.2.3+build',
  '-1.2.3', ' 1.2.3', '1.2.3 ', '1.2.3\n', '1.2.3\ninjected=true',
  '1.2.3\r', '1.2.3\t',
  "1.2.3'; await Bun.write('injected', 'yes'); //",
  '$(touch injected).2.3', '`touch injected`.2.3',
  'a[$(touch injected)].2.3'
];

for (const value of malformed) {
  test(`rejects explicit version ${JSON.stringify(value)} without changing files or executing input`, () => {
    runVersion('1.2.3', value, (result, actual, original) => {
      assert.notEqual(result.status, 0);
      assert.equal(actual, original);
      if (value) assert.match(result.stdout + result.stderr, /version must have the form x\.y\.z/i);
    });
  });
}

for (const value of [...malformed, null, 123, ['1.2.3']]) {
  for (const requested of ['major', 'minor', 'patch', '4.5.6']) {
    test(`rejects current version ${JSON.stringify(value)} before ${requested}`, () => {
      runVersion(value, requested, (result, actual, original) => {
        assert.notEqual(result.status, 0);
        assert.equal(actual, original);
        assert.match(result.stdout + result.stderr, /version must have the form x\.y\.z/i);
      });
    });
  }
}

for (const [current, requested, expected] of [
  ['0.0.0', 'patch', '0.0.1'],
  ['1.08.09', 'patch', '1.08.10'],
  ['1.08.09', 'minor', '1.9.0'],
  ['08.2.3', 'major', '9.0.0'],
  ['1.2.3', '00.08.09', '00.08.09']
]) {
  test(`numeric release policy accepts ${current} -> ${requested}`, () => {
    runVersion(current, requested, (result, actual) => {
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.deepEqual(JSON.parse(actual), {name: 'fixture', version: expected});
    });
  });
}
