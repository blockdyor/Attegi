import { test, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const source = readFileSync(new URL('../../src/js/libs/highlight.pack.js', import.meta.url), 'utf8');
const fixture = JSON.parse(readFileSync(new URL('highlight-vendor-baseline.json', import.meta.url), 'utf8'));
let original;
function load(text) {
    const context = vm.createContext({});
    vm.runInContext(text, context);
    return context.hljs;
}
let before, after;
beforeAll(() => {
    original = source;
    for (const { start, end, source: body } of fixture.originalFunctions) {
        const from = original.indexOf(start), to = original.indexOf(end, from);
        if (from < 0 || to <= from || original.indexOf(start, from + start.length) >= 0) throw Error('Invalid inverse: ' + start);
        original = original.slice(0, from) + body + original.slice(to);
    }
    original = original.replaceAll('.sort((a,b)=>a<b?-1:a>b?1:0).reverse()', '.sort().reverse()')
        .replace('grmr_wasm:e=>{const', 'grmr_wasm:e=>{e.regex;const')
        .replace('h=_.concat([{begin:/\\(/', 'h=_.concat([{begin:/(\\s*)\\(/')
        .replace('  Attegi local maintenance: statement-form mode transforms, explicit UTF-16\n' +
            '  string sorting, and removal of an unused WASM regex data-property read.\n' +
            '  Based on upstream 11.12.0; not byte-identical. Recursive JS parameter scan repaired.\n', '');
    // Verify immutable vendor bytes before either VM executes any code.
    expect(fixture.sha256).toBe('8ab71eb09c51f501e5e25157d9cff100e46cc29bcbfc744d0b746d451fca7f53');
    expect(createHash('sha256').update(original).digest('hex')).toBe(fixture.sha256);
    expect(fixture.originalFunctions.filter(row => row.start === 'grmr_php:e=>{')).toHaveLength(1);
    before = load(original);
    after = load(source);
});
function result(api, code, language = 'php', ignoreIllegals = false) {
    const r = api.highlight(code, { language, ignoreIllegals });
    expect(r.errorRaised).toBeUndefined();
    return { value: r.value, relevance: r.relevance, illegal: r.illegal, language: r.language };
}
const starts = ['<<<EOF\n', '<<<"EOF"\n', "<<<'EOF'\n"];
for (const [id, begin] of [['2r', starts[0]], ['2s', starts[2]]]) {
    test(`AaGqubYQiPLUZgo8aW${id}: compiled end does not restart on indentation`, () => {
        const r = after.highlight(begin + ' '.repeat(128) + '!', { language: 'php' });
        expect(r.errorRaised).toBeUndefined();
        expect(r._top.endRe.source).toBe('(\\w+)');
    });
}

test('PHP string endings preserve whitespace, delimiters, substitutions and following modes', () => {
    for (const quote of ['', '"', "'"]) for (const gap of ['', ' ', '\t \t']) {
        for (const nl of ['\n', '\r', '\r\n', '\u2028', '\u2029']) {
            for (const body of ['!', 'OTHER EOF', 'XEOF', '$x {$v} \\"', '\\ EOF', 'WORD\nEOF',
                'EOFx\nEOF', '123EOF', 'éEOF', 'EOF', 'OTHER', '/* EOF */', '# EOF', '// EOF', '']) {
                for (const indent of ['', ' ', '\t  ']) {
                    const code = `<<<${gap}${quote}EOF${quote}\n${body}${nl}${indent}EOF; Aa::CONST; $ok = 2;`;
                    expect(result(after, code)).toEqual(result(before, code));
                }
            }
        }
    }
    for (const begin of starts) for (const body of ['', '   !', '\t WRONG', '$x', '\\', '/*comment*/']) {
        expect(result(after, begin + body)).toEqual(result(before, begin + body));
    }
}, 30000);

test('safe/debug modes, illegals and highlightAuto preserve results', () => {
    for (const text of [original, source]) {
        const api = load(text);
        api.debugMode();
        for (const begin of starts) for (const body of ['EOF', ' \tEOF', 'WRONG', '$x {$v}', '\\ EOF']) {
            const code = begin + body + '\nEOF; new ValidName();';
            for (const ignore of [false, true]) expect(result(api, code, 'php', ignore)).toEqual(result(before, code, 'php', ignore));
            const a = api.highlightAuto(code, ['php', 'javascript', 'xml']);
            const b = before.highlightAuto(code, ['php', 'javascript', 'xml']);
            for (const key of ['value', 'relevance', 'illegal', 'language']) expect(a[key]).toEqual(b[key]);
            expect(a.errorRaised).toBeUndefined();
        }
        api.safeMode();
    }
});

test('string modes reused inside parents preserve custom ends, illegals and end callbacks', () => {
    for (const begin of starts) for (const tail of ['EOF; } $x = 2;', 'WRONG }', 'BAD EOF }']) {
        const values = [], events = [];
        for (const text of [original, source]) {
            const api = load(text), seen = [];
            const strings = api.getLanguage('php').contains.find(mode => mode.scope === 'string');
            api.registerLanguage('php-host', () => ({ contains: [{
                scope: 'box', begin: /\{/, end: /\}/, illegal: /BAD/,
                contains: [strings], 'on:end': match => seen.push([match[0], match.index])
            }] }));
            values.push(result(api, '{' + begin + '  ' + tail, 'php-host'));
            events.push(seen);
        }
        expect(values[1]).toEqual(values[0]);
        expect(events[1]).toEqual(events[0]);
    }
});

test('ordinary emitter supports reentrant highlighting with unchanged output', () => {
    for (const begin of starts) {
        const values = [];
        for (const text of [original, source]) {
            const api = load(text);
            const Base = api.highlight('warmup', { language: 'php' })._emitter.constructor;
            let active = false, entered = false, nested;
            class Reentrant extends Base {
                addText(text) {
                    if (!active && !entered && text.includes('trigger')) {
                        entered = true; active = true;
                        nested = result(api, "<<<'INNER'\nnested\nINNER;");
                        active = false;
                    }
                    super.addText(text);
                }
            }
            api.configure({ __emitter: Reentrant });
            const outer = result(api, begin + 'trigger $x\n  EOF; $ok = 2;');
            expect(entered).toBe(true);
            values.push({ outer, nested });
        }
        expect(values[1]).toEqual(values[0]);
    }
});

test('raw end-callback spans deliberately exclude indentation; captures and rendered output are preserved', () => {
    const rows = [];
    for (const [variant, begin] of [[2, starts[0]], [3, starts[2]]]) {
        const observations = [];
        for (const text of [original, source]) {
            const api = load(text), events = [];
            const strings = api.getLanguage('php').contains.find(mode => mode.scope === 'string');
            const mode = strings.variants[variant], callback = mode['on:end'];
            mode['on:end'] = (match, response) => {
                events.push({ lexeme: match[0], capture: match[1], index: match.index });
                callback(match, response);
            };
            const output = result(api, begin + '  WRONG\n\t EOF; $ok = 2;');
            observations.push({ events, output });
        }
        const [old, current] = observations;
        expect(current.output).toEqual(old.output);
        expect(current.events.map(event => event.capture)).toEqual(old.events.map(event => event.capture));
        expect(old.events[0].lexeme).toBe('  WRONG');
        expect(current.events[0].lexeme).toBe('WRONG');
        expect(current.events[0].index - old.events[0].index).toBe(2);
        expect(old.events[1].lexeme).toBe('\t EOF');
        expect(current.events[1].lexeme).toBe('EOF');
        rows.push({ begin, old: old.events, current: current.events });
    }
    console.log('PHP_END_CALLBACK_SPAN_CHANGE=' + JSON.stringify(rows));
});

test('bounded native matcher invocations inspect the actual compiled end alternatives', () => {
    const rows = [];
    for (const [id, begin] of [['2r', starts[0]], ['2s', starts[2]]]) {
        for (const n of [128, 256, 512, 1024]) for (const [label, text] of [['original', original], ['candidate', source]]) {
            const api = load(text);
            const top = api.highlight(begin + '!', { language: 'php' })._top;
            const calls = [];
            const regex = top.matcher.multiRegexes[0].matcherRe;
            const nativeExec = regex.exec;
            regex.exec = function (input) {
                const start = this.lastIndex, match = nativeExec.call(this, input);
                calls.push({ start, matched: match !== null });
                return match;
            };
            result(api, begin + ' '.repeat(n) + '!');
            expect(calls).toHaveLength(1);
            expect(calls[0].matched).toBe(false);
            const end = top.matcher.rules.at(-1)[0];
            expect(end).toBe(label === 'original' ? '[ \\t]*(\\w+)\\b' : '(\\w+)');
            rows.push({ id, n, label, end, matcher: regex.source, calls });
        }
    }
    // Native engines do not expose backtracking counts: source structure, not exec count,
    // proves removal of the whitespace-prefix restart. No whole-language linearity claim.
    console.log('PHP_NATIVE_MATCHER_CALLS=' + JSON.stringify(rows));
});

test('registrations, 71 aliases and public API are unchanged', () => {
    expect(after.listLanguages()).toHaveLength(36);
    expect(after.listLanguages()).toEqual(before.listLanguages());
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    let count = 0;
    for (const name of before.listLanguages()) {
        const aliases = before.getLanguage(name).aliases || [];
        count += aliases.length;
        expect(after.getLanguage(name).aliases).toEqual(before.getLanguage(name).aliases);
    }
    expect(count).toBe(71);
});

test('bounded whitespace witnesses preserve complete output with actual compiled matchers', () => {
    const rows = [];
    for (const n of [128, 256, 512, 1024]) for (const [id, begin] of [['2r', starts[0]], ['2s', starts[2]]]) {
        const code = begin + ' '.repeat(n) + '!';
        expect(result(after, code)).toEqual(result(before, code));
        const r = after.highlight(code, { language: 'php' });
        // This actual compiled terminator has no whitespace alternative or prefix.
        expect(r._top.endRe.source).toBe('(\\w+)');
        expect(r._top.terminatorEnd).toBe('(\\w+)');
        rows.push({ id, n, end: r._top.endRe.source, terminatorEnd: r._top.terminatorEnd });
    }
    console.log('PHP_STRING_ENDS_STRUCTURE=' + JSON.stringify(rows));
});
