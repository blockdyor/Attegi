import {restoreComment} from './fixtures/highlight-comment-reconstruction.cjs';
import { test, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const file = 'src/js/libs/highlight.pack.js';
const source = readFileSync(new URL(file, root), 'utf8');
// Inverse excerpts avoid duplicating the entire vendor and work in shallow CI clones.
// The pinned hash ensures the oracle is the exact actual pre-patch bundle, not a simulation.
const fixture = JSON.parse(readFileSync(new URL('highlight-vendor-baseline.json', import.meta.url), 'utf8'));
let baseline;
let before;
let after;
const plain = value => JSON.parse(JSON.stringify(value));
function load(text) {
    const context = vm.createContext({ console });
    // Observe actual initialization sorts in their own realm, without changing their results.
    vm.runInContext(`var sorts=[];const originalSort=Array.prototype.sort;
        Array.prototype.sort=function(compare){const input=Array.from(this);
        const output=originalSort.call(this,compare);
        sorts.push({input,output:Array.from(output),explicit:typeof compare==='function'});return output}`, context);
    vm.runInContext(text, context);
    return { api: context.hljs, sorts: plain(context.sorts), context };
}

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
    assert.equal(createHash('sha256').update(baseline).digest('hex'), fixture.sha256,
        'Inverse excerpts must reconstruct the exact pre-maintenance bundle');
    before = load(baseline);
    after = load(source);
});

test('S905: the five mode mutations use statements and WASM has no discarded regex read', () => {
    // Acceptance diagnostic for statement form, not a claim of an old functional bug.
    expect(source).toContain('if(void 0!==e.className){e.scope=e.className;delete e.className;}');
    expect(source).toContain('if(n&&e.beginKeywords){');
    expect(source).toContain('if(void 0===e.relevance){e.relevance=0;}');
    expect(source).toContain('e.begin=e.match;delete e.match;');
    expect(source).toContain('});e.keywords=t.keywords;e.begin=b(t.beforeMatch,d(t.begin));e.starts={');
    expect(source).toContain('};e.relevance=0;delete t.beforeMatch;');
    expect(source).toContain('if(e.scope&&"object"==typeof e.scope&&null!==e.scope){e.beginScope=e.scope;');
    expect(source).not.toContain('grmr_wasm:e=>{e.regex;');
});

test('S2871: all five actual string arrays have explicit code-unit ordering, including reverse', () => {
    expect(after.sorts.map(row => row.input.length)).toEqual([33, 59, 14, 520, 73]);
    after.sorts.forEach((row, index) => {
        expect(row.explicit).toBe(true);
        expect(row.input.every(value => typeof value === 'string')).toBe(true);
        expect(row.output).toEqual([...row.input].sort());
        expect([...row.output].reverse()).toEqual([...before.sorts[index].output].reverse());
        expect(row.input).toEqual(before.sorts[index].input);
    });
});

test('actual bundled regex API is a data property; public API and all 36 registrations survive', () => {
    for (const { api } of [before, after]) {
        const descriptor = Object.getOwnPropertyDescriptor(api, 'regex');
        expect(Object.hasOwn(descriptor, 'value')).toBe(true);
        expect(descriptor.get).toBeUndefined();
        expect(api.listLanguages()).toHaveLength(36);
    }
    expect(Object.keys(after.api).sort()).toEqual(Object.keys(before.api).sort());
    expect(plain(after.api.listLanguages())).toEqual(plain(before.api.listLanguages()));
});

const samples = {
    bash: '#!/bin/bash\nfunction greet() { echo "$HOME"; }',
    c: '#include <stdio.h>\nint main(void) { return 0; }',
    cpp: '#include <vector>\nclass Test { public: int value = 42; };',
    csharp: 'using System; class Test { public string Name => "hello"; }',
    css: '@media (min-width: 1px) { a:focus-visible::before { border-block-end-color: red; } }',
    diff: '--- a/file\n+++ b/file\n@@ -1 +1 @@\n-old\n+new',
    go: 'package main\nfunc main() { fmt.Println("hello") }',
    graphql: 'query GetUser($id: ID!) { user(id: $id) { name } }',
    ini: '[section]\nname = "hello"\nenabled = true',
    java: 'package demo; public class Test { int value = 42; }',
    javascript: 'class Foo extends Bar { run(x = (1 + 2)) { return `hello ${x}`; } }',
    json: '{"name":"hello","enabled":true,"number":42}',
    kotlin: 'data class User(val name: String)\nfun main() = println("hello")',
    less: '@color: red; .a { &:hover { color: @color; } }',
    lua: '-- comment\nlocal function hello(x) return "hi" .. x end',
    makefile: 'all: main.o\n\t$(CC) -o app main.o\n',
    markdown: '# Title\n**strong** [link](https://example.com)\n```js\nconst x = 1;\n```',
    objectivec: '#import <Foundation/Foundation.h>\n@interface Test : NSObject\n@end',
    perl: 'use strict; my $name = "hello"; print "$name\\n";',
    php: '<?php function hello($name) { return "hi " . $name; } ?>',
    'php-template': '<div><?php echo "hello"; ?></div>',
    plaintext: 'hello <world> & "friends"',
    python: '@decorator\ndef hello(name: str):\n    return f"hi {name}"',
    'python-repl': '>>> print("hello")\nhello\n>>> 1 + 2\n3',
    r: '# comment\nhello <- function(x) { print(x + 1) }',
    ruby: 'class Test\n  def hello(name)\n    puts "hi #{name}"\n  end\nend',
    rust: 'fn main() { let value: Option<u32> = Some(42); println!("{:?}", value); }',
    scss: '$color: red; .a { &:focus-within { color: $color; } }',
    shell: '$ echo "hello"\nhello',
    sql: 'SELECT users.name, COUNT(*) FROM users WHERE id > 1 GROUP BY name;',
    swift: 'struct User { let name: String }\nlet user = User(name: "hello")',
    typescript: 'interface User { name: string }\nconst user: User = {name: "hello"};',
    vbnet: 'Public Class Test\nDim value As Integer = 42\nEnd Class',
    wasm: '(module (; nested (; comment ;) ;) (func (export "add") (param i32 i32) (result i32) local.get 0 local.get 1 i32.add))',
    xml: '<root xmlns:x="urn:test"><x:item value="hello">text &amp; more</x:item></root>',
    yaml: 'name: hello\nitems:\n  - one\n  - true\n'
};
function result(api, code, language, ignoreIllegals) {
    const value = api.highlight(code, { language, ignoreIllegals });
    expect(value.errorRaised).toBeUndefined();
    return plain({ value: value.value, relevance: value.relevance, illegal: value.illegal, language: value.language });
}
for (const [language, sample] of Object.entries(samples)) {
    test(`differential HTML/relevance/illegal/language: ${language}`, () => {
        for (const code of [sample, '', '< & " \' >\n! @ {} [] ()', sample + '\n"unterminated']) {
            for (const ignoreIllegals of [false, true]) {
                expect(result(after.api, code, language, ignoreIllegals)).toEqual(result(before.api, code, language, ignoreIllegals));
            }
        }
    });
}
test('differential CSS-family output for every fixed media feature, pseudo and attribute', () => {
    const [media, classes, elements, attributes] = before.sorts.map(row => row.input);
    const code = media.map(name => `@media (${name}: 1px) { a { color: red; } }`).join('\n') + '\n' +
        classes.map(name => `a:${name} { color: red; }`).join('\n') + '\n' +
        elements.map(name => `a::${name} { color: red; }`).join('\n') + '\n' +
        'a {' + attributes.map(name => `${name}: initial;`).join('\n') + '}';
    for (const language of ['css', 'less', 'scss']) {
        expect(result(after.api, code, language, true)).toEqual(result(before.api, code, language, true));
    }
});

test('automatic detection preserves the original language ranking, HTML and relevance', () => {
    for (const code of [
        samples.javascript,
        samples.typescript,
        'function f \t\n (a = (1 + (2)), b = call(3)) { return a; }',
        'function f(a = (        !)) {}'
    ]) {
        const summarize = value => plain({value: value.value, relevance: value.relevance,
            language: value.language, illegal: value.illegal,
            secondBest: value.secondBest && {language: value.secondBest.language, relevance: value.secondBest.relevance}});
        expect(summarize(after.api.highlightAuto(code))).toEqual(summarize(before.api.highlightAuto(code)));
    }
});

test('differential corpus covers every registered language exactly', () => {
    expect(Object.keys(samples).sort()).toEqual(plain(before.api.listLanguages()).sort());
});

function custom(api, mode, code) {
    api.registerLanguage('quality-test', () => ({ contains: [mode] }));
    api.debugMode();
    return result(api, code, 'quality-test', false);
}
const transformations = [
    ['className', () => ({ className: 'title', begin: /hello/ }), 'hello world', 'hljs-title'],
    ['beginKeywords default relevance', () => ({ beginKeywords: 'hello world', end: /;/ }), 'hello value; .world value;', 'hljs-keyword'],
    ['beginKeywords explicit relevance and keywords', () => ({ beginKeywords: 'hello', keywords: 'value', relevance: 7, end: /;/ }), 'hello value;', 'hljs-keyword'],
    ['match', () => ({ scope: 'number', match: /42/ }), 'value = 42;', 'hljs-number'],
    ['beforeMatch shared converted child', () => ({ beforeMatch: /@/, begin: /hello/, end: /;/, scope: 'title', keywords: 'value' }), '@hello value;', 'hljs-title'],
    ['scope object multi-match', () => ({ match: [/hello/, / /, /world/], scope: { 1: 'keyword', 3: 'title' } }), 'hello world', 'hljs-title'],
    ['null scope guard', () => ({ scope: null, begin: /hello/ }), 'hello world', 'hello'],
    ['string scope guard', () => ({ scope: 'title', begin: /hello/ }), 'hello world', 'hljs-title']
];
for (const [name, factory, code, html] of transformations) {
    test(`actual API mode transformation: ${name}`, () => {
        const oldMode = factory(), newMode = factory();
        const expected = custom(load(baseline).api, oldMode, code);
        const actual = custom(load(source).api, newMode, code);
        expect(actual).toEqual(expected);
        expect(actual.value).toContain(html);
        expect(Object.keys(newMode).sort()).toEqual(Object.keys(oldMode).sort());
        if (name.startsWith('className')) expect(newMode.className).toBeUndefined();
        if (name.startsWith('beginKeywords')) expect(newMode.beginKeywords).toBeUndefined();
        if (name === 'match') expect(newMode.match).toBeUndefined();
        if (name.startsWith('beforeMatch')) {
            expect(newMode.starts.contains[0].beforeMatch).toBeUndefined();
            expect(newMode.starts.contains[0].endsParent).toBe(true);
        }
        if (name.startsWith('scope object')) expect(newMode.scope).toBeUndefined();
    });
}

test('mode validation errors remain observable through actual API in debug mode', () => {
    for (const factory of [() => ({ match: /x/, begin: /x/ }), () => ({ beforeMatch: /@/, begin: /x/, starts: {} })]) {
        for (const text of [baseline, source]) expect(() => custom(load(text).api, factory(), '@x')).toThrow();
    }
});

(process.env.HIGHLIGHT_VERIFY_BUILD === '1' ? test : test.skip)('build copies the maintained vendor bytes unchanged when built', () => {
    expect(readFileSync(new URL('assets/js/highlight.pack.js', root), 'utf8')).toBe(source);
    for (const template of ['post.hbs', 'page.hbs']) {
        expect(readFileSync(new URL(template, root), 'utf8')).toContain('data-highlight="{{asset "js/highlight.pack.js"}}"');
    }
});
