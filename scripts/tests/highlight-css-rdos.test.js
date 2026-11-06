import {restoreComment} from './fixtures/highlight-comment-reconstruction.cjs';
import { beforeAll, test, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const source = readFileSync(new URL('../../src/js/libs/highlight.pack.js', import.meta.url), 'utf8');
const fixture = JSON.parse(readFileSync(new URL('highlight-vendor-baseline.json', import.meta.url), 'utf8'));
let baseline, before, after;
beforeAll(() => {
    baseline = restoreComment(source);
    for (const { start, end, source: original } of fixture.originalFunctions) {
        const from = baseline.indexOf(start), to = baseline.indexOf(end, from);
        assert(from >= 0 && to > from, `Missing baseline boundary: ${start}`);
        baseline = baseline.slice(0, from) + original + baseline.slice(to);
    }
    baseline = baseline.replaceAll('.sort((a,b)=>a<b?-1:a>b?1:0).reverse()', '.sort().reverse()')
        .replace('grmr_wasm:e=>{const', 'grmr_wasm:e=>{e.regex;const')
        .replace('h=_.concat([{begin:/\\(/', 'h=_.concat([{begin:/(\\s*)\\(/')
        .replace('  Attegi local maintenance: statement-form mode transforms, explicit UTF-16\n' +
            '  string sorting, and removal of an unused WASM regex data-property read.\n' +
            '  Based on upstream 11.12.0; not byte-identical. Recursive JS parameter scan repaired.\n', '');
    assert.equal(createHash('sha256').update(baseline).digest('hex'), fixture.sha256);
    before = load(baseline);
    after = load(source);
});
function load(text) {
    const context = vm.createContext({ console });
    vm.runInContext(text, context);
    return context.hljs;
}
function highlight(api, code, language = 'css', ignoreIllegals = true) {
    const result = api.highlight(code, { language, ignoreIllegals });
    expect(result.errorRaised).toBeUndefined();
    return { value: result.value, relevance: result.relevance, illegal: result.illegal, language: result.language };
}

test('every identifier callback refreshes its equal-input cache reference', () => {
    const counts = { callbacks: 0, refreshes: 0 };
    const context = vm.createContext({ console, counts });
    const instrumented = source.replace('const t=n.data;', 'counts.callbacks++;const t=n.data;')
        .replace('t.input=e.input;', 't.input=e.input;counts.refreshes++;');
    expect(instrumented).not.toBe(source);
    vm.runInContext(instrumented, context);
    for (const language of ['css', 'less', 'scss']) {
        const buffer = Buffer.from(`a { x: ${'z'.repeat(2000)}!; }`);
        const expected = highlight(before, buffer.toString(), language);
        for (let repeat = 0; repeat < 3; repeat++) {
            counts.callbacks = counts.refreshes = 0;
            expect(highlight(context.hljs, Buffer.from(buffer).toString(), language)).toEqual(expected);
            expect(counts.callbacks).toBeGreaterThan(1000);
            expect(counts.refreshes).toBe(counts.callbacks);
        }
    }
});

for (const language of ['css', 'scss']) {
    test(`${language}: actual at-rule matcher avoids suffix-search attribute regex`, () => {
        const compiled = [], scans = [];
        const context = vm.createContext({ console, compiled, scans });
        vm.runInContext(`const exec = RegExp.prototype.exec;
            RegExp.prototype.exec = function(text) {
                if (text.startsWith('@media ')) compiled.push(this.source);
                const result = exec.call(this, text);
                if (this.source === '[a-z-]+' && this.global && !this.multiline && result) {
                    scans.push({ index: result.index, length: result[0].length });
                }
                return result;
            };`, context);
        vm.runInContext(source, context);
        const code = `@media ${'z'.repeat(2000)}!;`;
        expect(highlight(context.hljs, code, language)).toEqual(highlight(before, code, language));
        expect(compiled.length).toBeGreaterThan(0);
        expect(compiled.some(pattern => pattern.includes('[a-z-]+(?=:)'))).toBe(false);
        expect(scans.some(row => row.index === 7 && row.length === 2000)).toBe(true);
        expect(scans.reduce((sum, row) => sum + row.length, 0)).toBeLessThanOrEqual(code.length);
    });
    test(`${language}: at-rule alphabet, priority, invalid adjacency and keyword buffers`, () => {
        const values = ['z!:foo:1', 'z!foo(1) width:2', '12foo:1', '_foo:2', 'a_foo:2',
            'a1foo:2', 'MiXeD-Name:1', '--FOO:2', 'and not only or', 'and!:or:1',
            'min-width:1px', 'width :1', 'width\\:1', '"x:1" width:2',
            'z!:COLOR:var(--x)', 'a-1.2foo(1)', 'U+1234foo:2'];
        for (const gap of [' ', '\t', '\n', '\r', '\u2028', '\u2029']) {
            for (const value of values) {
                for (const ignoreIllegals of [true, false]) {
                    const code = `@media${gap}${value}${gap}{ a { x: foo(1); } }`;
                    expect(highlight(after, code, language, ignoreIllegals)).toEqual(highlight(before, code, language, ignoreIllegals));
                }
            }
        }
    });
}

const tokens = ['z', '-', 'a1', 'a-12px-', 'a-1.2px-', 'a-1%-', 'a-U+1234-'];
for (const language of ['css', 'less', 'scss']) {
    test(`${language}: full highlight scans disjoint identifiers, not repeated suffixes`, () => {
        const scans = [];
        const context = vm.createContext({ console, scans });
        vm.runInContext(String.raw`
            const exec = RegExp.prototype.exec;
            RegExp.prototype.exec = function (text) {
                const result = exec.call(this, text);
                if (this.source === '[\\w-]+' && this.global && result) {
                    scans.push({ index: result.index, length: result[0].length });
                }
                return result;
            };
        `, context);
        vm.runInContext(source, context);
        highlight(context.hljs, 'a { x: warmup; }', language);
        for (const n of [1000, 2000, 4000, 8000]) {
            for (const token of tokens) {
                const candidate = token.repeat(Math.ceil(n / token.length));
                for (const suffix of ['!', 'foo(1)']) {
                    const code = `a { x: ${candidate}${suffix}; }`;
                    scans.length = 0;
                    expect(highlight(context.hljs, code, language)).toEqual(highlight(before, code, language));
                    expect(scans.length).toBeGreaterThan(0);
                    // Less has two independent matchers (attribute and function); neither rescans suffixes.
                    expect(scans.reduce((sum, row) => sum + row.length, 0)).toBeLessThanOrEqual(2 * code.length);
                }
            }
        }
    }, 30000);

    for (const value of ['a-1.2foo(1)', 'a-1.2pxfoo(1)', 'a-1.2em-test(4)', 'a-1%foo(1)', 'a-U+1234foo(1)']) {
        test(`${language}: boundary-crossing number retains function suffix: ${value}`, () => {
            const code = `a { x: ${value}; }`;
            expect(highlight(after, code, language)).toEqual(highlight(before, code, language));
        });
    }
}

const values = [
    'var(--theme-color)', '--custom-function(1px)', '-webkit-transform(2deg)',
    '---dash(3)', 'f_1(2)', '12foo(3)', '1.2em-test(4)',
    'red', 'initial', 'inherit', 'calc(100% - var(--gap))',
    'url("a.png")', 'data-uri(image/png;base64,abc)', 'zurl(test)',
    '"a-12px U+1234"', "'x'", '/* z-12 */', '#aabbcc !important',
    'abc-12px-def-34rem', 'foo--bar', 'z-U+1234-5678', 'U+4??',
    'a-1.25em-z', 'foo-123abc', '1em2px', '--123-4px',
    'a-1.2foo(1)', 'a-1.2pxfoo(1)', 'a-1.2em-test(4)',
    'a-1%foo(1)', 'a-U+1234foo(1)',
    'min(1px, max(2px, 3px))', 'f(/* comment */ "string", 1turn)',
    'x-1px-y-U+1234', 'z'.repeat(1000) + '!',
    'and not or', 'and(1)', 'not(2)', 'name : value', 'foo-bar\n : var(--x)',
    '@var', '@@var', '@{var}', '~`a`', 'fn(a: 1, b: 2)', 'foo(1)bar(2)',
    '$xdata-uri(édata-uri(a]é//x\napx[px\u00a0foo('
];
// Cross-product probes the mid-identifier boundaries that a skip rule would swallow.
for (const left of ['a', '_a', '-', '--', 'z-', '1px', 'a-1px-']) {
    for (const right of ['12px', 'U+1234', '--var', '-foo', '_1', '1.2em', 'url(x)', 'f(2)']) {
        values.push(left + right);
    }
}
for (const language of ['css', 'less', 'scss']) {
    test(`${language}: exact HTML, relevance, illegal and language for dispatch and nested syntax`, () => {
        for (const value of values) {
            for (const code of [value, `a { x: ${value}; }`, `@media (min-width: 1px) { a:hover { --prop: ${value}; color: var(--prop); } }`]) {
                for (const ignoreIllegals of [true, false]) {
                    expect(highlight(after, code, language, ignoreIllegals)).toEqual(highlight(before, code, language, ignoreIllegals));
                }
            }
        }
    }, 30000);
}

test('bounded adversarial full highlight preserves all three languages at 1k/2k/4k/8k', () => {
    const rows = [];
    for (const language of ['css', 'less', 'scss']) {
        for (const n of [1000, 2000, 4000, 8000]) {
            for (const token of tokens) {
                const code = `a { x: ${token.repeat(Math.ceil(n / token.length))}!; }`;
                const begin = performance.now();
                const expected = highlight(before, code, language);
                const oldMs = performance.now() - begin;
                const next = performance.now();
                expect(highlight(after, code, language)).toEqual(expected);
                rows.push({ language, n, token, beforeMs: oldMs, afterMs: performance.now() - next });
            }
        }
    }
    if (process.env.CSS_RDOS_BENCH) console.log(JSON.stringify({ engine: process.version, rows }));
}, 30000);
