const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');

for (const [file, version] of [
  ['build.yml', 'v${{ needs.build.outputs.version }}'],
  ['release.yml', '${{ needs.build.outputs.tag }}']
]) {
  test(`${file} publishes the blockdyor release name before its version`, () => {
    const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows', file), 'utf8');
    const title = `Attegi for blockdyor ${version}`;
    assert.ok(workflow.includes(`          name: ${title}\n`), 'The GitHub release title must identify the blockdyor fork');
    assert.ok(workflow.includes(`            ## 🎨 ${title}\n`), 'The release notes heading must use the same name');
  });
}
