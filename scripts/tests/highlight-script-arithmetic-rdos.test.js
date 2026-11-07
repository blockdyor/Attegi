import {restoreSwiftComment as restoreComment} from './fixtures/highlight-swift-reconstruction.cjs';
import { test, expect, beforeAll } from 'bun:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../src/js/libs/highlight.pack.js', import.meta.url), 'utf8');
const fixture = JSON.parse(readFileSync(new URL('highlight-vendor-baseline.json', import.meta.url), 'utf8'));
const scanCalls = new WeakMap();
let before, after;
beforeAll(() => {
    let original = restoreComment(source);
    for (const { start, end, source: body } of fixture.originalFunctions) {
        const from = original.indexOf(start), to = original.indexOf(end, from);
        assert(from >= 0 && to > from && original.indexOf(start, from + start.length) === -1,
            `Missing or ambiguous baseline boundary: ${start}`);
        original = original.slice(0, from) + body + original.slice(to);
    }
    original = original.replaceAll('.sort((a,b)=>a<b?-1:a>b?1:0).reverse()', '.sort().reverse()')
        .replace('grmr_wasm:e=>{const', 'grmr_wasm:e=>{e.regex;const')
        .replace('h=_.concat([{begin:/\\(/', 'h=_.concat([{begin:/(\\s*)\\(/')
        .replace('  Attegi local maintenance: statement-form mode transforms, explicit UTF-16\n' +
            '  string sorting, and removal of an unused WASM regex data-property read.\n' +
            '  Based on upstream 11.12.0; not byte-identical. Recursive JS parameter scan repaired.\n', '');
    assert.equal(fixture.sha256, '8ab71eb09c51f501e5e25157d9cff100e46cc29bcbfc744d0b746d451fca7f53');
    assert.equal(createHash('sha256').update(original).digest('hex'), fixture.sha256);
    before = load(original);
    after = load(source);
});
function load(text, trace = false) {
    const context = vm.createContext({ console });
    if (trace) vm.runInContext(`var scanCalls=[];const originalExec=RegExp.prototype.exec;
        RegExp.prototype.exec=function(input){
            if(this.global && ['[0-9A-Za-z$_]+', '\\\\s*', '\\\\d+'].includes(this.source))
                scanCalls.push({source:this.source,index:this.lastIndex,input});
            return originalExec.call(this,input);
        };`, context);
    vm.runInContext(text, context);
    scanCalls.set(context.hljs, context.scanCalls);
    return context.hljs;
}
function result(api, code, language) {
    const r = api.highlight(code, { language, ignoreIllegals: false });
    expect(r.errorRaised).toBeUndefined();
    return { value: r.value, relevance: r.relevance, illegal: r.illegal, language: r.language };
}
function same(code, language) {
    expect(result(after, code, language)).toEqual(result(before, code, language));
}
function walk(mode, seen = new Set()) {
    if (!mode || typeof mode !== 'object' || seen.has(mode)) return [];
    seen.add(mode);
    return [mode, ...[...(mode.contains || []), ...(mode.variants || [])].flatMap(child => walk(child, seen))];
}

test('arrow parent consumes failed whitespace runs without changing protected outer params', () => {
    result(after, '= (//) =>\n)   !', 'javascript');
    const modes = walk(after.getLanguage('javascript'));
    const arrow = modes.find(m => m.scope === 'function' && m.returnBegin && String(m.end) === '\\s*=>');
    expect(arrow.contains.some(m => String(m.begin) === '/\\s+/')).toBe(true);
    expect(modes.some(m => String(m.begin) === '/(\\s*)\\(/')).toBe(true);
});

test('optional keys use bounded single-character candidates with original flags', () => {
    result(after, 'z   !', 'typescript');
    const optional = walk(after.getLanguage('typescript')).find(m => m.scope === 'attr' && m['on:begin']);
    expect(optional).toBeDefined();
    expect(String(optional.begin)).toBe('/[A-Za-z$_]/');
    result(before, 'x?: number', 'typescript');
    const oldOptional = walk(before.getLanguage('typescript')).find(m => m.scope === 'attr' && String(m.begin).includes('?:'));
    expect(optional.beginRe.flags).toBe(oldOptional.beginRe.flags);
    expect(optional.endRe.flags).toBe(oldOptional.beginRe.flags);
});

test('arithmetic numbers use bounded single-character candidates with original flags', () => {
    result(after, '$((a111!', 'bash');
    const number = walk(after.getLanguage('bash')).find(m => m.scope === 'number' && m['on:begin']);
    expect(number).toBeDefined();
    expect(String(number.begin)).toBe('/\\d/');
    result(before, '$((a2#ff))', 'bash');
    const oldNumber = walk(before.getLanguage('bash')).find(m => String(m.begin) === '/\\d+#[0-9a-f]+/');
    expect(number.beginRe.flags).toBe(oldNumber.beginRe.flags);
    expect(number.endRe.flags).toBe(oldNumber.beginRe.flags);
});

test('arrow comments, nesting and protected multiline parameter output stay exact', () => {
    for (const language of ['javascript', 'typescript']) for (const nl of ['\n', '\r', '\u2028', '\u2029']) {
        for (const code of [
            `function f${nl}  (a, b = (1 + 2)) { return a; }`,
            `const f =${nl} (a, b = (1 + 2)) => a;`,
            `= (//) =>${nl})   !`, `= (//) =>${nl})   => x`,
            `= (/* ) => */ a) => x`, '= (a = ((2)), b) => b',
            '= (a)   (b) => b', `get f${nl}(a) { return a; }`,
            `class C { constructor${nl} (x) {} f${nl}(x) {} }`,
            '= () => x', '= a => x', '= (a)   !', '= (a)\t\n => x'
        ]) same(code, language);
    }
});

test('optional identifiers retain suffixes, dollars, keys and parameter contexts', () => {
    for (const name of ['x', '$', '_', '$x', 'x$', '123abc', 'a$b', 'éabc', 'Zed', 'ABC']) {
        for (const gap of ['', ' ', '\t\n', '\r', '\u2028', '\u2029']) {
            for (const tail of ['?: string', '? : string', ': string', '!', '?: number, next?: boolean']) {
                for (const wrap of [x => x, x => `interface I { ${x} }`, x => `function f(${x}) {}`]) same(wrap(name + gap + tail), 'typescript');
            }
        }
    }
    for (const code of ['bad! good?: string', 'invalid   ! valid?: number', 'z z z ! x?: number', '$$?: number']) {
        same(code, 'typescript');
        same((' ' + code).slice(1), 'typescript');
    }
}, 60000);

test('base-number end starts at a literal delimiter without rescanning digit suffixes', () => {
    for (const digits of ['2', '0012', '123456789']) {
        for (const tail of ['#ff', '#a#ff', '#aZ', '#Ff', '#g', '#0a + 2#ff']) {
            same(`$((a${digits}${tail}))`, 'bash');
        }
    }
    const number = walk(after.getLanguage('bash')).find(m => m.scope === 'number' && m['on:begin']);
    expect(number.endRe.source).toBe('#[0-9a-f]+');
});

test('Bash arithmetic retains base digits, adjacent modes and awkward functions', () => {
    for (const prefix of ['', 'a', '2#', '$x', ' ']) for (const digits of ['1', '111', '0012']) {
        for (const tail of ['!', '#ff', '#Ff', '#0a', '#g', '#', '.2', '#a$HOME + 12', '#a)) echo 3']) same('$(( ' + prefix + digits + tail, 'bash');
    }
    for (const name of ['123', '2abc', 'foo-bar', 'a.b', '2#abc']) same(`${name}() { echo $((a111!)); }`, 'bash');
});

test('actual compiled arrow matcher consumes the formerly failed suffix', () => {
    const code = '= (//) =>\n)' + ' '.repeat(256) + '!';
    same(code, 'javascript');
    for (const api of [before, after]) {
        const arrow = walk(api.getLanguage('javascript')).find(m =>
            m.scope === 'function' && m.returnBegin && String(m.end) === '\\s*=>');
        const matcher = arrow.matcher.getMatcher(0);
        matcher.lastIndex = 11;
        const matched = matcher.exec(code);
        if (api === before) expect(matched).toBeNull();
        else {
            expect(matched.index).toBe(11);
            expect(matched[0]).toBe(' '.repeat(256));
            expect(matched.rule.skip).toBe(true);
        }
    }
});

test('callback suffix scans are charged once per rejected run, not per candidate', () => {
    const traced = load(source, true);
    for (const n of [32, 128, 512]) {
        for (const [language, code, pattern] of [
            ['typescript', 'z'.repeat(n) + ' '.repeat(n) + '!', '[0-9A-Za-z$_]+'],
            ['bash', '$((a' + '1'.repeat(n) + '!', '\\d+']
        ]) {
            const calls = scanCalls.get(traced);
            calls.length = 0;
            expect(result(traced, code, language)).toEqual(result(before, code, language));
            expect(calls.filter(c => c.source === pattern && c.input === code)).toHaveLength(1);
            if (language === 'typescript') expect(calls.filter(c => c.source === '\\s*' && c.input === code)).toHaveLength(1);
        }
    }
});

test('rejected runs, fresh equal input, nested modes and following valid candidates stay exact', () => {
    for (const nl of ['\n', '\r', '\u2028', '\u2029']) {
        for (const [language, code] of [
            ['typescript', `bad   !${nl}valid?: number`],
            ['typescript', `function f(bad !${nl}valid?: number, Zed?: string) {}`],
            ['typescript', `interface I { bad !${nl}$valid?: boolean; x?: number }`],
            ['typescript', '123abc! $bad! foo$bar?: string'],
            ['bash', `$((a111.2${nl}a2#ff + 12 + 2#FF + $HOME)) echo 3`],
            ['bash', `$((a111!${nl}a12#ff + $x + 3))`],
            ['bash', '${x:-$((a111.2 + 2#ff))} "$((a111! + 3#abc))"'],
            ['bash', 'echo $(echo "$((a111.2 + $HOME + 12#ff))")']
        ]) {
            same(code, language);
            same(Buffer.from(code).toString(), language);
            same('x', language);
            same(Buffer.from(code).toString(), language);
        }
    }
});

test('registrations, aliases and public API remain unchanged', () => {
    expect(after.listLanguages()).toHaveLength(36);
    expect(after.listLanguages()).toEqual(before.listLanguages());
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    const aliases = before.listLanguages().flatMap(name => {
        expect(after.getLanguage(name).aliases).toEqual(before.getLanguage(name).aliases);
        return before.getLanguage(name).aliases || [];
    });
    expect(aliases).toHaveLength(71);
    for (const language of aliases) same('x', language);
});

test('bounded genuine full-highlight witnesses preserve exact API results', () => {
    const rows = [];
    for (const api of [before, after]) for (const language of ['javascript', 'typescript', 'bash']) result(api, 'warmup', language);
    for (const n of [500, 1000, 2000, 4000]) for (const [language, code] of [
        ['javascript', '= (//) =>\n)' + ' '.repeat(n) + '!'],
        ['typescript', 'z'.repeat(n) + ' '.repeat(n) + '!'],
        ['bash', '$((a' + '1'.repeat(n) + '!']
    ]) {
        const row = { language, n };
        let expected;
        for (const [label, api] of [['before', before], ['after', after]]) {
            const start = performance.now();
            const actual = result(api, code, language);
            row[label + 'Ms'] = performance.now() - start;
            if (label === 'before') expected = actual;
            else expect(actual).toEqual(expected);
        }
        rows.push(row);
    }
    console.log('SCRIPT_ARITHMETIC_BENCHMARK_JSON=' + JSON.stringify(rows));
}, 60000);
