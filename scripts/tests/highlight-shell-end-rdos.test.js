import {restoreSwiftComment as restoreComment} from './fixtures/highlight-swift-reconstruction.cjs';
import { beforeAll, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

let before, after;
function load(text) {
    const context = vm.createContext({ console });
    vm.runInContext(text, context);
    return { api: context.hljs, context };
}
beforeAll(() => {
    const source = readFileSync(new URL('../../src/js/libs/highlight.pack.js', import.meta.url), 'utf8');
    const fixture = JSON.parse(readFileSync(new URL('highlight-vendor-baseline.json', import.meta.url), 'utf8'));
    let original = restoreComment(source);
    for (const { start, end, source: body } of fixture.originalFunctions) {
        const from = original.indexOf(start), to = original.indexOf(end, from);
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
    // Authenticate the complete immutable oracle before either VM executes.
    expect(createHash('sha256').update(original).digest('hex')).toBe('8ab71eb09c51f501e5e25157d9cff100e46cc29bcbfc744d0b746d451fca7f53');
    expect(fixture.sha256).toBe('8ab71eb09c51f501e5e25157d9cff100e46cc29bcbfc744d0b746d451fca7f53');
    before = load(original);
    after = load(source);
});
function result(instance, code, language, ignoreIllegals = true) {
    const r = instance.api.highlight(code, { language, ignoreIllegals });
    expect(r.errorRaised).toBeUndefined();
    return { value: r.value, relevance: r.relevance, illegal: r.illegal, language: r.language };
}
function compare(code, language) {
    for (const ignore of [false, true]) {
        const expected = result(before, code, language, ignore);
        expect(result(after, code, language, ignore)).toEqual(expected);
        expect(result(after, Buffer.from(code).toString(), language, ignore)).toEqual(expected);
    }
}
function trace(instance, code, language) {
    // Delegate to the native exec unchanged; inspect actual combined matchers, not helper counters.
    vm.runInContext(`globalThis.traceRows = []; globalThis.nativeExec = RegExp.prototype.exec;
        RegExp.prototype.exec = function(input) {
            const from = this.lastIndex, match = nativeExec.call(this, input);
            traceRows.push({ source: this.source, flags: this.flags, from, index: match?.index, text: match?.[0] });
            return match;
        };`, instance.context);
    try {
        const value = result(instance, code, language);
        return { value, rows: instance.context.traceRows };
    } finally {
        vm.runInContext('RegExp.prototype.exec = nativeExec;', instance.context);
    }
}

test('AaGqubYQiPLUZgo8aW2y: native Shell end matcher has no repeated suffix lookahead', () => {
    result(after, '$ warmup', 'shell');
    const mode = after.api.getLanguage('shell').contains[0].starts;
    expect(mode.endRe.source).toBe('[^\\\\]');
    expect(typeof mode['on:end']).toBe('function');
    const work = [];
    for (const n of [64, 128, 256, 512]) {
        const code = '$ ' + ' '.repeat(n) + '!';
        const actual = trace(after, code, 'shell');
        expect(actual.value).toEqual(result(before, code, 'shell'));
        const combined = actual.rows.filter(r => r.source === '([^\\\\])');
        expect(combined.length).toBeGreaterThan(0);
        work.push({ n, combinedCalls: combined.length });
        expect(combined.every(r => r.flags === 'gm')).toBe(true);
        expect(combined.length).toBeLessThanOrEqual(code.length + 1);
        expect(combined.filter(r => r.text !== undefined).every(r => r.text.length === 1)).toBe(true);
        expect(actual.rows.filter(r => r.source === '\\s' && r.flags === '').length).toBeLessThanOrEqual(code.length);
    }
    expect(work.map(row => row.combinedCalls)).toEqual([65, 129, 257, 513]);
    console.log('SHELL_END_NATIVE=' + JSON.stringify(work));
});

test('Shell exact HTML, escaping, continuations, later prompts and all line boundaries', () => {
    for (const boundary of ['\n', '\r', '\r\n', '\u2028', '\u2029']) {
        for (const command of ['', ' ', '\t', 'echo hi', 'echo "<&>"', '\\', '\\  ', 'echo \\\nnext', '   !', 'foo\u00a0']) {
            for (const prefix of ['$ ', ' $ ', 'user@host:~$ ', '> ']) {
                compare(`${prefix}${command}${boundary}output${boundary}$ echo "$HOME"${boundary}`, 'shell');
                result(after, '$ unrelated!\n', 'shell');
            }
        }
    }
    for (const code of ['$ ' + ' '.repeat(32) + '!\n$ echo 1', '$ x\\\n  y\n$ echo 2', '$ x\\ \n$ echo 3', '$ \\ \u2028$ echo 4', '$ a\t\v\f\u00a0\ufeff', '$ a\r\n\r\n$ b']) compare(code, 'shell');
}, 60000);

test('Shell cache survives normal-emitter reentrancy and fresh equal input references', () => {
    const code = '$ first\n$ ' + ' '.repeat(40) + '!\n$ echo "<&>"\n';
    const Emitter = after.api.highlight('', { language: 'shell' })._emitter.constructor;
    let inside = false, calls = 0;
    class ReentrantEmitter extends Emitter {
        addText(text) {
            if (!inside && text === 'first' && calls === 0) {
                inside = true;
                calls++;
                try { result(after, '$ inner \\\n continuation\n$ done\n', 'shell'); }
                finally { inside = false; }
            }
            super.addText(text);
        }
    }
    after.api.configure({ __emitter: ReentrantEmitter });
    try {
        compare(code, 'shell');
        compare('$ different\n' + code, 'shell');
        expect(calls).toBeGreaterThan(0);
    } finally { after.api.configure({ __emitter: Emitter }); }
});

test('36 registrations, 71 aliases, public API, auto ranking and errors are preserved', () => {
    const languages = before.api.listLanguages();
    expect(languages).toHaveLength(36);
    expect(after.api.listLanguages()).toEqual(languages);
    expect(Object.keys(after.api).sort()).toEqual(Object.keys(before.api).sort());
    let aliases = 0;
    for (const language of languages) {
        const names = before.api.getLanguage(language).aliases || [];
        aliases += names.length;
        expect(after.api.getLanguage(language).aliases).toEqual(before.api.getLanguage(language).aliases);
        for (const alias of names) expect(after.api.getLanguage(alias)).toBe(after.api.getLanguage(language));
    }
    expect(aliases).toBe(71);
    for (const language of ['console', 'shellsession']) compare('$ echo hi', language);
    for (const code of ['/** foo@bar @param1@tag */', '$ echo hi\n$ next\n', '/** TODO: fix this */', '<&>']) {
        function auto(instance) {
            const r = instance.api.highlightAuto(code);
            return { value: r.value, relevance: r.relevance, illegal: r.illegal, language: r.language, second: r.secondBest && { value: r.secondBest.value, relevance: r.secondBest.relevance, language: r.secondBest.language } };
        }
        expect(auto(after)).toEqual(auto(before));
    }
    expect(() => after.api.highlight('x', { language: 'not-a-language' })).toThrow('Unknown language: "not-a-language"');
});

/**
 * shortcut: on:end callback events are newly observable; this is not custom-grammar
 * identity. The O(n) whitespace index retains one input; normal-emitter reentry
 * can evict it and rebuild it. This is not a universal linear-time Bash claim.
 * Keep the original one-UTF-16-code-unit end span and Shell priority unchanged.
 */
test('Shell suffix predicate agrees with native multiline $ at every candidate', () => {
    const callback = after.api.getLanguage('shell').contains[0].starts['on:end'];
    const alphabet = ['a', '\\', ' ', '\t', '\r', '\n', '\u2028', '\u2029', '\ufeff', '\u0085', '\u200b'];
    let strings = 0, candidates = 0;
    function visit(input, depth) {
        strings++;
        for (let index = 0; index < input.length; index++) {
            if (input[index] === '\\') continue;
            const match = [input[index]];
            match.input = input;
            match.index = index;
            let ignored = false;
            callback(match, { ignoreMatch() { ignored = true; } });
            const native = /[^\\](?=\s*$)/gm;
            native.lastIndex = index;
            const expected = native.exec(input);
            expect(!ignored).toBe(Boolean(expected && expected.index === index));
            candidates++;
        }
        if (depth) for (const char of alphabet) visit(input + char, depth - 1);
    }
    visit('', 4);
    expect(strings).toBe(16105);
    expect(candidates).toBe(57100);
});

test('Shell native emitter tree keeps original Bash spans and later mode boundaries', () => {
    for (const code of ['$ echo hi\n$ next\n', '$ a\r\n$ b', '$ a\u2028$ b', '$ a\u2029$ b', '$ echo "<&>"', '$ x\\\n  y\n$ next']) {
        const expected = before.api.highlight(code, { language: 'shell' });
        const actual = after.api.highlight(code, { language: 'shell' });
        expect(actual.errorRaised).toBeUndefined();
        expect(JSON.stringify(actual._emitter.rootNode)).toBe(JSON.stringify(expected._emitter.rootNode));
    }
});
