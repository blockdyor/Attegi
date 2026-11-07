import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../src/js/libs/highlight.pack.js', import.meta.url), 'utf8');
const fixture = JSON.parse(readFileSync(new URL('highlight-vendor-baseline.json', import.meta.url), 'utf8'));
let original = source;
for (const { start, end, source: body } of fixture.originalFunctions.filter(row => /^grmr_(bash|vbnet):/.test(row.start))) {
    const from = original.indexOf(start), to = original.indexOf(end, from);
    original = original.slice(0, from) + body + original.slice(to);
}
function load(text) {
    const context = vm.createContext({ console });
    vm.runInContext(text, context);
    return context.hljs;
}
const before = load(original), after = load(source);
function result(api, code, language) {
    const r = api.highlight(code, { language, ignoreIllegals: false });
    expect(r.errorRaised).toBeUndefined();
    return { value: r.value, relevance: r.relevance, illegal: r.illegal, language: r.language };
}

test('Bash compiled function mode bounds candidate retries at word boundaries', () => {
    result(after, '', 'bash');
    const bash = after.getLanguage('bash').contains.find(mode => mode.scope === 'function');
    expect(bash.beginRe.source.startsWith('\\b')).toBe(true);
});

test('VB compiled directive mode bounds candidate retries at line starts', () => {
    result(after, '', 'vbnet');
    const vb = after.getLanguage('vbnet').contains.find(mode => mode.scope === 'meta');
    expect(vb.beginRe.source.startsWith('^')).toBe(true);
});

test('Bash function HTML and relevance preserve numeric, hyphenated and multiline names', () => {
    const names = ['f', 'foo_bar', '123', '2abc', 'foo-bar', '-f', '2#abc', 'a.b', '_', 'function'];
    for (const name of names) for (const gap of ['', ' ', '\t\n']) {
        for (const prefix of ['', 'function ', 'echo x; ', '$x ', '2#']) {
            const code = `${prefix}${name}${gap}(${gap})${gap}{ echo "$HOME"; }`;
            expect(result(after, code, 'bash')).toEqual(result(before, code, 'bash'));
        }
    }
    for (const code of ['foo() {', '2#abc() {', 'foo-bar() {']) {
        expect(result(after, code, 'bash').value).toContain('hljs-title');
    }
});

test('VB directives retain indentation scopes, case, comments, relevance and date/number precedence', () => {
    for (const directive of ['const', 'disable', 'else', 'elseif', 'enable', 'end', 'externalsource', 'if', 'region']) {
        for (const indent of ['', ' ', '\t  \t']) for (const newline of ['\n', '\r\n']) {
            const code = `Dim x As Integer = 2${newline}${indent}#${directive.toUpperCase()} True Then 'comment${newline}End Class`;
            expect(result(after, code, 'vbnet')).toEqual(result(before, code, 'vbnet'));
        }
    }
    for (const code of ['#12/31/2025#', '#2025-12-31#', '2#abc', 'Dim x = 2#', "' #if True", '"#region"', '\t #unknown']) {
        expect(result(after, code, 'vbnet')).toEqual(result(before, code, 'vbnet'));
    }
});

test('VB only recognizes directives at valid line starts, not after code', () => {
    const code = 'Dim x = 1 : #if True Then';
    expect(result(before, code, 'vbnet').value).toContain('hljs-meta');
    expect(result(after, code, 'vbnet').value).not.toContain('hljs-meta');
});

test('all registrations, aliases and public API remain available', () => {
    expect(after.listLanguages()).toHaveLength(36);
    expect(after.listLanguages()).toEqual(before.listLanguages());
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    for (const name of before.listLanguages()) {
        expect(after.getLanguage(name).aliases).toEqual(before.getLanguage(name).aliases);
    }
    for (const language of ['sh', 'zsh', 'vb']) {
        expect(result(after, 'f() {', language)).toEqual(result(before, 'f() {', language));
    }
});

test('bounded genuine witnesses preserve full-highlight output and relevance', () => {
    const rows = [];
    // Compile and warm both APIs before any timed region; no CI wall-clock assertions.
    for (const api of [before, after]) for (const language of ['bash', 'vbnet']) result(api, 'warmup', language);
    for (const n of [1000, 2000, 4000, 8000]) {
        for (const [language, code] of [['bash', 'a'.repeat(n) + '!'], ['vbnet', ' '.repeat(n) + '!']]) {
            const row = { language, n };
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
    console.log('SHELL_VB_BENCHMARK_JSON=' + JSON.stringify(rows));
}, 30000);
