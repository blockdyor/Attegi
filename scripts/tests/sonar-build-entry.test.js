import { expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const source = readFileSync(new URL('../build.js', import.meta.url), 'utf8');
const require = createRequire(new URL('../build.js', import.meta.url));

test('build entry reports and exits on rejection before asset copying', async () => {
  const errors = [];
  const exits = [];
  const result = vm.runInNewContext(source, {
    require,
    console: {
      log() { throw new Error('startup logging failed'); },
      error(...args) { errors.push(args); }
    },
    process: { argv: ['bun', 'build.js', '--prod'], exit(code) { exits.push(code); } }
  });

  // Observe the returned entry promise so a regression cannot leak into other tests.
  await Promise.resolve(result).catch(() => {});
  expect(errors).toEqual([['\n[Error] Build failed:', 'startup logging failed']]);
  expect(exits).toEqual([1]);
});

test('build entry reports a real asset failure and exits nonzero', () => {
  const directory = mkdtempSync(join(tmpdir(), 'attegi-sonar-build-'));
  try {
    mkdirSync(join(directory, 'src/js/libs'), { recursive: true });
    writeFileSync(join(directory, 'src/js/libs/highlight.pack.js'), '');
    // An ordinary file prevents creation of the required output directory.
    writeFileSync(join(directory, 'assets'), 'not a directory');
    const result = spawnSync(process.execPath, [new URL('../build.js', import.meta.url).pathname, '--prod'], {
      cwd: directory,
      encoding: 'utf8'
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('[Error] Build failed:');
    expect(result.stdout).not.toContain('[Done]');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
