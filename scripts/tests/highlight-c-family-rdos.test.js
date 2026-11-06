import {restoreComment} from './fixtures/highlight-comment-reconstruction.cjs';
import { test, expect, beforeAll } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../src/js/libs/highlight.pack.js', import.meta.url), 'utf8');
const fixture = JSON.parse(readFileSync(new URL('highlight-vendor-baseline.json', import.meta.url), 'utf8'));
let original, before, after, counted, work;
beforeAll(() => {
    original = restoreComment(source);
    for (const { start, end, source: body } of fixture.originalFunctions) {
        const from = original.indexOf(start), to = original.indexOf(end, from);
        // The helper does not exist yet when running RED on the original source.
        if (from < 0 && body === '') continue;
        expect(from).toBeGreaterThanOrEqual(0);
        expect(to).toBeGreaterThan(from);
        original = original.slice(0, from) + body + original.slice(to);
    }
    original = original.replaceAll('.sort((a,b)=>a<b?-1:a>b?1:0).reverse()', '.sort().reverse()')
        .replace('grmr_wasm:e=>{const', 'grmr_wasm:e=>{e.regex;const')
        .replace('h=_.concat([{begin:/\\(/', 'h=_.concat([{begin:/(\\s*)\\(/')
        .replace('  Attegi local maintenance: statement-form mode transforms, explicit UTF-16\n' +
            '  string sorting, and removal of an unused WASM regex data-property read.\n' +
            '  Based on upstream 11.12.0; not byte-identical. Recursive JS parameter scan repaired.\n', '');
    expect(createHash('sha256').update(original).digest('hex')).toBe('8ab71eb09c51f501e5e25157d9cff100e46cc29bcbfc744d0b746d451fca7f53');
    before = load(original);
    after = load(source);
    const start = source.indexOf('function includeAngleBegin(){');
    const end = source.indexOf('var Pe=Object.freeze', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    let helpers = source.slice(start, end);
    // Count actual helper loop iterations/callbacks; no production test hooks.
    for (const [needle, replacement] of [
        ['=>{\n', '=>{__work.callbacks++;\n'],
        ['for(let i=text.length-1;i>=0;i--){', 'for(let i=text.length-1;i>=0;i--){__work.steps++;'],

    ]) {
        expect(helpers).toContain(needle);
        helpers = helpers.replaceAll(needle, replacement);
    }
    work = { steps: 0, callbacks: 0, execs: 0 };
    const context = vm.createContext({ console, __work: work });
    vm.runInContext('const exec=RegExp.prototype.exec;RegExp.prototype.exec=function(text){__work.execs++;return exec.call(this,text)};', context);
    vm.runInContext(source.slice(0, start) + helpers + source.slice(end), context);
    counted = context.hljs;
});
function load(text) {
    const context = vm.createContext({ console });
    vm.runInContext(text, context);
    return context.hljs;
}
function result(api, code, language, ignoreIllegals = false) {
    const r = api.highlight(code, { language, ignoreIllegals });
    expect(r.errorRaised).toBeUndefined();
    return { value: r.value, relevance: r.relevance, illegal: r.illegal, language: r.language };
}
function same(code, language) {
    for (const flag of [false, true]) expect(result(after, code, language, flag)).toEqual(result(before, code, language, flag));
}
function modes(api, language) {
    result(api, '', language);
    const seen = new Set(), found = [];
    function walk(mode) {
        if (seen.has(mode)) return;
        seen.add(mode); found.push(mode);
        for (const child of mode.contains || []) if (typeof child === 'object') walk(child);
        if (mode.starts) walk(mode.starts);
    }
    walk(api.getLanguage(language));
    return found;
}

for (const [id, language] of [['2Y', 'c'], ['2Z', 'cpp'], ['2o', 'objectivec']]) {
    test(`${id}: compiled include path eliminates suffix rescanning`, () => {
        const all = modes(after, language);
        expect(all.some(m => m.beginRe?.source === '<.*?>')).toBe(false);
        expect(all.some(m => m.beginRe?.source === '<' && m['on:begin'])).toBe(true);
        const parent = all.find(m => m.contains?.some(c => c.beginRe?.source === '<' && c['on:begin']));
        const index = parent.contains.findIndex(c => c.beginRe?.source === '<' && c['on:begin']);
        const valid = parent.contains[index], fallback = parent.contains[index + 1];
        expect(fallback.beginRe.source).toBe('<');
        expect(fallback.scope).toBeUndefined();
        expect(fallback.relevance).toBe(0);
        expect(valid.beginRe.flags).toBe(modes(before, language).find(m => m.beginRe?.source === '<.*?>').beginRe.flags);
        expect(valid.endRe.source).toBe(language === 'objectivec' ? '$' : '>');
    });
}
test('2c: compiled function end eliminates whitespace suffix rescanning', () => {
    expect(modes(after, 'csharp').some(m => m.scope === 'function' && m.endRe.source === '\\s*[{;=]')).toBe(false);
});

test('include exact spans, permissive nested text, escaping and invalid then valid candidates', () => {
    for (const language of ['c', 'cpp', 'objectivec']) {
        for (const directive of ['include', 'import', 'define']) {
            for (const body of ['<x>', '<<x>> tail', '<a<b> c>', '<"\\>&x> tail', '<! <ok> "next"', '<! // comment', '<! /* comment */ <ok>', '<! "x" <ok>', '<! 23 café <ok>', '<unterminated']) {
                for (const sep of ['\n', '\r', '\r\n', '\u2028', '\u2029']) {
                    const code = `#${directive} ${body}${sep}#include <next> tail${sep}int x = 1;`;
                    same(code, language);
                    same(JSON.parse(JSON.stringify(code)), language);
                }
            }
        }
        for (const context of ['', 'int f() { ', 'x = ', '( ']) {
            same(context + '#include <a<b> trailing\nint x;', language);
            same(context + '#include <<!\n#include <valid>', language);
        }
    }
}, 60000);

test('function end leaves the original whitespace outside its exact scope only at delimiters', () => {
    for (const gap of ['', ' ', '\t  ', '\n  ', '\r', '\r\n', '\v\f', '\u00a0\u1680\u2000\u202f\u205f\u3000\ufeff', '\u2028', '\u2029', '\n\r\u2028\u2029', '\n'.repeat(64)]) {
        for (const suffix of ['{ return 1; }', '; int x;', '= value;', '! more', '/*c*/ ;', '// c\n;', '']) {
            for (const head of ['void f()', 'public int Foo(int x)', 'void f() /*c*/', 'class X { void f()', 'void f(){ int g()', 'void f(string s = """raw""")']) same(head + gap + suffix, 'csharp');
        }
    }
});

test('registrations, aliases and public API remain unchanged', () => {
    expect(after.listLanguages()).toHaveLength(36);
    expect(after.listLanguages()).toEqual(before.listLanguages());
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    for (const name of before.listLanguages()) expect(after.getLanguage(name).aliases).toEqual(before.getLanguage(name).aliases);
    for (const alias of ['h', 'cc', 'c++', 'objc', 'obj-c++', 'cs', 'c#']) same('#include <x>\nvoid f() {}', alias);
});

test('bounded full-highlighter witnesses retain output with setup excluded from timing', () => {
    const rows = [];
    for (const api of [before, after]) for (const language of ['c', 'cpp', 'objectivec', 'csharp']) result(api, 'warmup', language);
    for (const n of [512, 1024, 2048, 4096]) {
        for (const [path, language, code] of [
            ...['c', 'cpp', 'objectivec'].map(language => ['include', language, '#include ' + '<'.repeat(n) + '!']),
            ['end', 'csharp', 'void f()' + ' '.repeat(n) + '!']
        ]) {
            const row = { path, language, n };
            let expected;
            for (const [label, api] of [['before', before], ['after', after]]) {
                const start = performance.now();
                const r = api.highlight(code, { language, ignoreIllegals: false });
                row[label + 'Ms'] = performance.now() - start;
                expect(r.errorRaised).toBeUndefined();
                const actual = { value: r.value, relevance: r.relevance, illegal: r.illegal };
                if (label === 'before') expected = actual;
                else expect(actual).toEqual(expected);
            }
            rows.push(row);
        }
    }
    console.log('C_FAMILY_BENCHMARK_JSON=' + JSON.stringify(rows));
}, 60000);

const paths = [
    ['2Y', 'c', n => '#include ' + '<'.repeat(n) + '!'],
    ['2Z', 'cpp', n => '#include ' + '<'.repeat(n) + '!'],
    ['2o', 'objectivec', n => '#include ' + '<'.repeat(n) + '!'],
    ['2c', 'csharp', n => 'void f()' + ' '.repeat(n) + '!']
];
for (const [id, language, witness] of paths) {
    test(`${id}: actual indexed work and matcher calls stay bounded on fresh equal buffers`, () => {
        const rows = [];
        for (const n of [64, 256, 1024]) {
            const text = witness(n);
            for (let repeat = 0; repeat < 3; repeat++) {
                const fresh = Buffer.from(text).toString();
                Object.assign(work, { steps: 0, callbacks: 0, execs: 0 });
                const actual = result(counted, fresh, language);
                const row = { id, n, repeat, ...work };
                expect(row.steps).toBeLessThanOrEqual(5 * fresh.length);
                expect(row.callbacks).toBeLessThanOrEqual(2 * fresh.length);
                expect(row.execs).toBeLessThanOrEqual(15 * fresh.length + 100);
                expect(row.callbacks).toBeGreaterThan(0);
                expect(actual).toEqual(result(before, fresh, language));
                rows.push(row);
            }
        }
        console.log('C_FAMILY_WORK_JSON=' + JSON.stringify(rows));
    }, 60000);
}

test('invalid include starts preserve later directives', () => {
    for (const language of ['c', 'cpp', 'objectivec']) {
        for (const body of ['<', '< abc', '< café', '< 23', '< /*c*/', '< //c', '< "x"']) {
            for (const sep of ['\n', '\r', '\u2028', '\u2029']) same('#include ' + body + sep + '#include <ok> tail', language);
        }
    }
}, 60000);

// Popping after one whitespace exposes the unchanged root attribute regex.
test('2c: successful ends consume complete whitespace and delimiter before root resumes', () => {
    const resumes = [];
    const context = vm.createContext({ console, resumes });
    vm.runInContext(String.raw`const native = RegExp.prototype.exec;
        RegExp.prototype.exec = function(text) {
            if (this.global && this.source.startsWith('(') && this.source.includes('^\\s*\\[') && this.lastIndex >= 8)
                resumes.push(this.lastIndex);
            return native.call(this, text);
        };`, context);
    vm.runInContext(source, context);
    for (const n of [16, 32, 64]) for (const delimiter of [';', '=', '{']) {
        resumes.length = 0;
        const code = 'void f()' + '\n'.repeat(n) + delimiter;
        expect(result(context.hljs, code, 'csharp')).toEqual(result(before, code, 'csharp'));
        expect(resumes.length).toBeGreaterThan(0);
        expect(Math.min(...resumes)).toBeGreaterThanOrEqual(9 + n);
    }
});

test('unrepaired 2b retains original raw semantics under custom-emitter reentrancy', () => {
    function reentrant(text) {
        const api = load(text);
        const Base = api.highlight('warmup', { language: 'csharp' })._emitter.constructor;
        let busy = false, triggered = 0, nested;
        class ReentrantEmitter extends Base {
            addText(text) {
                if (!busy && triggered === 0 && text.includes(' = ')) {
                    busy = true; triggered++;
                    nested = result(api, '"""nested"""', 'csharp');
                    busy = false;
                }
                return super.addText(text);
            }
        }
        api.configure({ __emitter: ReentrantEmitter });
        const outer = result(api, 'var s = """outer"""; int y = 1;', 'csharp');
        expect(triggered).toBe(1);
        expect(outer.relevance).toBe(3);
        expect(outer.value).toContain('<span class="hljs-built_in">int</span>');
        return { outer, nested };
    }
    expect(reentrant(source)).toEqual(reentrant(original));
});

test('automatic ranking and all 71 aliases remain stable', () => {
    let count = 0;
    for (const name of before.listLanguages()) for (const alias of before.getLanguage(name).aliases || []) {
        expect(after.getLanguage(alias)).toBe(after.getLanguage(name)); count++;
    }
    expect(count).toBe(71);
    for (const code of ['#include <x>\nint main() { return 1; }', '#import <Foundation.h>\n@interface Test\n@end', 'void f()  { var s = """raw"""; }', '"""! """ok"""']) {
        const fields = r => ({ value: r.value, relevance: r.relevance, illegal: r.illegal, language: r.language, secondBest: r.secondBest && { language: r.secondBest.language, relevance: r.secondBest.relevance, value: r.secondBest.value } });
        expect(fields(after.highlightAuto(code))).toEqual(fields(before.highlightAuto(code)));
    }
}, 60000);
