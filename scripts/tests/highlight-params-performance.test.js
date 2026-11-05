const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const fixture = require('./fixtures/highlight-params-baseline.json');
const bundlePath = path.resolve(__dirname, '../../src/js/libs/highlight.pack.js');
const source = fs.readFileSync(bundlePath, 'utf8');
const context = vm.createContext({});
vm.runInContext(source, context);
const hljs = context.hljs;

// A whitespace prefix restarts the assembled parameter matcher at every space.
// Output comparisons below guard the exclusion/recursive-mode semantics.
// Only the recursive mode can drop this prefix: outer parameter entry needs
// its whitespace match to beat the enclosing mode's immediate end matcher.
test('recursive parameter mode begins do not rescan a leading whitespace run', () => {
  assert.equal(source.includes('h=_.concat([{begin:/(\\s*)\\(/'), false);
  assert.ok(source.includes('h=_.concat([{begin:/\\(/'));
});

test('JavaScript and TypeScript parameter output, relevance and escaping match the original bundle', () => {
  for (const entry of fixture.cases) {
    const result = hljs.highlight(entry.code, {language: entry.language, ignoreIllegals: true});
    assert.deepEqual({value: result.value, relevance: result.relevance, illegal: result.illegal}, entry.expected, entry.name);
    assert.equal(result.errorRaised, undefined, entry.name);
  }
});

test('all original languages and the public highlighter API remain available', () => {
  assert.deepEqual(Array.from(hljs.listLanguages()).sort(), fixture.languages);
  for (const name of fixture.api) assert.equal(typeof hljs[name], 'function', name);
  for (const entry of fixture.smoke) {
    const result = hljs.highlight(entry.code, {language: entry.language, ignoreIllegals: true});
    assert.deepEqual({value: result.value, relevance: result.relevance, illegal: result.illegal}, entry.expected, entry.language);
    assert.equal(result.errorRaised, undefined, entry.language);
  }
});
