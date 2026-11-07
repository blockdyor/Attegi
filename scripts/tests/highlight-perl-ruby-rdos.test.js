import {restoreSwiftComment as restoreComment} from './fixtures/highlight-swift-reconstruction.cjs';
import { test, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const source = readFileSync(new URL('../../src/js/libs/highlight.pack.js', import.meta.url), 'utf8');
const fixture = JSON.parse(readFileSync(new URL('highlight-vendor-baseline.json', import.meta.url), 'utf8'));
let before, after, candidateSource;
function load(text) {
    const context = vm.createContext({ console });
    vm.runInContext(text, context);
    return context.hljs;
}
beforeAll(() => {
    let original = restoreComment(source);
    for (const { start, end, source: body } of fixture.originalFunctions) {
        const from = original.indexOf(start), to = original.indexOf(end, from);
        assert(from >= 0 && to > from, `Missing baseline boundary: ${start}`);
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
    let candidate = source;
    const restore = process.env.HIGHLIGHT_PERL_RUBY_COUNTERFACTUAL;
    if (restore) {
        assert(['perl', 'ruby'].includes(restore));
        const row = fixture.originalFunctions.find(row => row.start === `grmr_${restore}:e=>{`);
        const from = candidate.indexOf(row.start), to = candidate.indexOf(row.end, from);
        candidate = candidate.slice(0, from) + row.source + candidate.slice(to);
    }
    candidateSource = candidate;
    after = load(candidate);
});
function result(api, code, language, ignoreIllegals = false) {
    const r = api.highlight(code, { language, ignoreIllegals });
    expect(r.errorRaised).toBeUndefined();
    return { value: r.value, relevance: r.relevance, illegal: r.illegal, language: r.language };
}
function compare(code, language) {
    for (const ignore of [false, true]) expect(result(after, code, language, ignore)).toEqual(result(before, code, language, ignore));
}

test('Perl active function/class matchers consume failed attribute whitespace runs', () => {
    result(after, 'sub f !; class F !;', 'perl');
    for (const scope of ['function', 'class']) {
        const mode = after.getLanguage('perl').contains.find(m => m.scope === scope);
        expect(mode.contains.some(m => m.relevance === 0 && m.beginRe.test('   !'))).toBe(true);
    }
});

test('Ruby compiled heredoc opener delegates eligibility without a suffix lookahead scan', () => {
    result(after, '<<EOF\nx\nEOF', 'ruby');
    const heredoc = after.getLanguage('ruby').contains.find(m => String(m.begin).includes('<<'));
    expect(typeof heredoc['on:begin']).toBe('function');
    expect(heredoc.begin.toString()).not.toContain('[^\\n]*');
});

test('Perl failed runs preserve raw emitter chunks as well as rendered output', () => {
    for (const code of ['sub f   !', 'class F   !', 'sub f :a(x) :b(y);', 'my $f :a(x);', 'sub f (x){42;}']) {
        const oldResult = before.highlight(code, { language: 'perl', ignoreIllegals: false });
        const newResult = after.highlight(code, { language: 'perl', ignoreIllegals: false });
        expect(newResult.errorRaised).toBeUndefined();
        expect(JSON.stringify(newResult._emitter.rootNode)).toBe(JSON.stringify(oldResult._emitter.rootNode));
    }
});

const whitespace = [' ', '\t', '\n', '\r', '\r\n', '\v', '\f', '\u00a0', '\ufeff', '\u2028', '\u2029'];
test('Perl attributes retain entire whitespace scopes, optional arguments and declaration ends', () => {
    for (const prefix of ['sub f', 'method f', 'class F', 'my $f', '$f']) {
        for (const gap of whitespace) for (const tail of [
            ':lvalue;', ': attr(x) { 42; }', ':attr (x) {', ':attr (x)!', ':attr (x\ny);',
            ':attr (x)\n:other;', ': attr(', ': !;', '!', '(x){', '(x);', '(x)!', '(x\ny){', '{', ';'
        ]) compare(prefix + gap.repeat(3) + tail, 'perl');
    }
});

test('Ruby heredoc preserves permissive delimiters, quoting, whitespace and following scopes', () => {
    for (const modifier of ['', '-', '~']) for (const quote of ['', "'", '"']) {
        for (const delimiter of ['EOF', '_', 'A1', '123']) for (const gap of whitespace) {
            for (const body of ['x\n', ' \n\t\n', 'EOFx\n', 'z\r', '#{42}\n', '']) {
                const code = `x = <<${modifier}${quote}${delimiter}${quote} junk\n${body}${gap}${delimiter}!\nputs 42`;
                compare(code, 'ruby');
            }
        }
    }
    for (const code of [
        '<<EOF', '<<EOF\n!', '<<EOF\nEOFx', '<<EOF\rEOF', '<<EOF\u2028EOF',
        '<<EOF\nEOF', '<<EOF\n EOFsuffix\nEOF', '<<\n<<EOF\nx\nEOF\n42',
        '<<BAD\n!\n<<EOF\nx\nEOF\nputs 42', '<<EOF\n<<EOF\nEOF\n42',
        '<<EOF\n EOF\r\n42', '<<EOF\n\u2028EOF\u2029\nputs 42',
        ':<<BAD\n!\n:<<EOF\nx\nEOF\n42', '"#{ <<EOF\nx\nEOF\n42 }"'
    ]) compare(code, 'ruby');
});

test('fresh equal strings and alternating failed/valid candidates retain parser state', () => {
    for (let i = 0; i < 6; i++) for (const code of [
        '<<BAD\n!\n<<EOF\nx\nEOF\nputs 42', '<<EOF\n \n!',
        '<<EOF\nEOF\n42', '<<BAD\nBADx\n<<A\nx\n A\n42'
    ]) compare(JSON.parse(JSON.stringify(code)), 'ruby');
    for (let i = 0; i < 6; i++) for (const code of ['sub f :a(x) :b(y);', 'sub f :a( :b( !;', 'my $f :a(x);']) {
        compare(JSON.parse(JSON.stringify(code)), 'perl');
    }
});

test('all registrations, aliases, and public API remain unchanged', () => {
    expect(after.listLanguages()).toHaveLength(36);
    expect(after.listLanguages()).toEqual(before.listLanguages());
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    for (const language of before.listLanguages()) expect(after.getLanguage(language).aliases).toEqual(before.getLanguage(language).aliases);
    const aliases = before.listLanguages().flatMap(name => before.getLanguage(name).aliases || []);
    expect(aliases).toHaveLength(71);
    for (const alias of aliases) compare('warmup 42', alias);
    for (const alias of ['pl', 'pm', 'rb', 'gemspec', 'podspec', 'thor', 'irb']) compare('sub f :attr;\n<<EOF\nx\nEOF', alias);
});

test('bounded warmed complete-highlighter witnesses preserve exact results', () => {
    for (const api of [before, after]) for (const language of ['perl', 'ruby']) result(api, 'warmup', language);
    const rows = [];
    for (const n of [256, 512, 1024, 2048]) for (const [language, path, code] of [
        ['perl', 'function ATTR', 'sub f' + ' '.repeat(n) + '!'],
        ['perl', 'class ATTR', 'class F' + ' '.repeat(n) + '!'],
        ['ruby', 'fixed opener', '<<EOF\n' + ' \n'.repeat(n) + '!'],
        ['ruby', 'repeated failed openers', '<<EOF\n'.repeat(n) + '!']
    ]) {
        const row = { language, path, n };
        let expected;
        for (const [label, api] of [['before', before], ['after', after]]) {
            const start = performance.now();
            const r = api.highlight(code, { language, ignoreIllegals: false });
            row[label + 'Ms'] = performance.now() - start;
            expect(r.errorRaised).toBeUndefined();
            const summary = { value: r.value, relevance: r.relevance, illegal: r.illegal };
            if (label === 'before') expected = summary;
            else expect(summary).toEqual(expected);
        }
        rows.push(row);
    }
    console.log('PERL_RUBY_BENCHMARK_JSON=' + JSON.stringify(rows));
}, 120000);

test('Perl trailing whitespace cannot reuse an earlier declaration close at input offset zero', () => {
    for(const code of ['(x); sub f   ', '(x); sub f\n\t', '(x); sub f :a(x)   ']) {
        expect(detailed(after,code)).toEqual(detailed(before,code));
    }
});

test('Perl declaration parent and bridge native restart scans are removed together', () => {
    result(after, 'sub f !; class F !;', 'perl');
    for (const scope of ['function','class']) {
        const mode = after.getLanguage('perl').contains.find(m => m.scope === scope);
        expect(mode.contains.some(m => m.endsParent)).toBe(false);
        expect(mode.matcher.rules.every(([pattern]) => !String(pattern).includes('.*?'))).toBe(true);
        if (scope === 'function') {
            expect(mode.endRe.source).toBe(String.raw`\s+|[({;]`);
            expect(typeof mode['on:end']).toBe('function');
            expect(typeof mode.contains.at(-1)['on:begin']).toBe('function');
        }
    }
});

function detailed(api, code, language = 'perl', reentry = false) {
    const Emitter = api.highlight('warmup', { language })._emitter.constructor;
    const chunks = [];
    let active = false, entered = false;
    class Recording extends Emitter {
        addText(text) {
            if (text && !active) chunks.push(text);
            if (reentry && !entered && (text.includes('sub') || text.includes(':a'))) {
                entered = true;
                active = true;
                try { api.highlight('sub inner (wrong; ! (ok); print 9;', { language:'perl' }); }
                finally { active = false; }
            }
            return super.addText(text);
        }
    }
    api.configure({__emitter:Recording});
    let r;
    try { r = api.highlight(code, {language, ignoreIllegals:false}); }
    finally { api.configure({__emitter:Emitter}); }
    if(reentry)expect(entered).toBe(true);
    expect(r.errorRaised).toBeUndefined();
    const tops = [];
    for (let m=r._top; m; m=m.parent) tops.push({scope:m.scope,skip:m.skip,excludeEnd:m.excludeEnd,returnEnd:m.returnEnd});
    return JSON.parse(JSON.stringify({value:r.value,relevance:r.relevance,illegal:r.illegal,language:r.language,
        ir:r._emitter.rootNode,chunks,tops}));
}
test('Perl indexed declaration ends preserve complete excluded spans and nonempty emitter chunks', () => {
    for (const prefix of ['sub f','method f','class F']) for (const gap of whitespace) for (const tail of [
        '(x); print 42;', '(x){ 42; }', '(bad; ! (valid); print 42;', '(bad) ! (valid); print 42;',
        '((;x); print 42;', '(x); y);', '(x\ny); print 42;', '(x\ry);', '(x\u2028y);', '(x\u2029y);',
        '\n(x); print 42;', '!', '((((!', '); print 42;', '; print 42;', '{42;}', ':a(x) (z); print 42;'
    ]) {
        const code=prefix+gap.repeat(3)+tail;
        expect(detailed(after,code)).toEqual(detailed(before,code));
    }
});
test('Perl accepted end callbacks expose primitive candidates only to the new opt-in handler', () => {
    const code='sub f (bad; ! (valid); print 42;';
    result(after,'sub f !','perl'); result(before,'sub f !','perl');
    const actual=after.getLanguage('perl').contains.find(m=>m.scope==='function');
    const expected=before.getLanguage('perl').contains.find(m=>m.scope==='function');
    const spans=[], native=[];
    for(const [mode,isNew] of [[actual,true],[expected,false]]) {
        const callback=mode['on:end'];
        mode['on:end']=(m,r)=>{
            if(callback)callback(m,r);
            if(!r.isMatchIgnored)spans.push(r._endLexeme ?? m[0]);
            if(isNew)native.push(m[0]);
        };
        try { detailed(isNew?after:before,code); } finally {mode['on:end']=callback;}
    }
    expect(spans).toEqual([' (bad; ! (valid);',' (bad; ! (valid);']);
    expect(native).toEqual([' ']);
});
test('Perl declaration indexed work and matcher calls are bounded on fresh equal missing/valid spans', () => {
    result(after,'sub f !','perl');
    const mode=after.getLanguage('perl').contains.find(m=>m.scope==='function');
    const exec=mode.matcher.exec;
    const rows=[];
    for(const n of [64,128,256,512]) for(const tail of ['!','); print 42;']) {
        const code='sub f '+ '('.repeat(n)+tail;
        for(let repeat=0;repeat<2;repeat++) {
            const calls=[];
            mode.matcher.exec=function(input){const m=exec.call(this,input);calls.push({start:this.lastIndex,index:m?.index,text:m?.[0],type:m?.type});return m;};
            try {expect(detailed(after,JSON.parse(JSON.stringify(code)))).toEqual(detailed(before,code));}
            finally {mode.matcher.exec=exec;}
            expect(calls.length).toBeLessThanOrEqual(code.length*3);
            expect(calls.every(m=>!m.text || m.text.length===1 || /^\s+$/.test(m.text) || /^[A-Za-z]+$/.test(m.text))).toBe(true);
            rows.push({n,tail,repeat,calls:calls.length,bytes:code.length});
        }
    }
    console.log('PERL_DECLARATION_MATCHER_WORK='+JSON.stringify(rows));
});
test('Perl declaration index visits each code unit once and reuses only equal input indexes', () => {
    const context = vm.createContext({console});
    vm.runInContext(`var indexWork={steps:0}; const nativeTest=RegExp.prototype.test;
        RegExp.prototype.test=function(input){if(this.source==='\\\\s' && input.length===1)indexWork.steps++;
        return nativeTest.call(this,input);};`,context);
    vm.runInContext(candidateSource,context);
    expect(candidateSource.includes('}\ndeclarationInput=input;\nconst at=')).toBe(true);
    const api=context.hljs;
    const rows=[];
    for(const n of [64,128,256,512]) for(const tail of ['!', '); print 42;', '\n(x);']) {
        const code='sub f '+ '('.repeat(n)+tail;
        for(let repeat=0;repeat<2;repeat++) {
            context.indexWork.steps=0;
            expect(detailed(api,JSON.parse(JSON.stringify(code)))).toEqual(detailed(before,code));
            expect(context.indexWork.steps).toBe(repeat?0:code.length);
            rows.push({n,tail,repeat,indexSteps:context.indexWork.steps,bytes:code.length});
        }
    }
    console.log('PERL_DECLARATION_INDEX_WORK='+JSON.stringify(rows));
});

test('Perl ATTR prefixes still have consuming or exit guards in all five compiled callers', () => {
    result(after,'sub f !; class F !; $1; $x; $!;','perl');
    const seen=new Set(),callers=[];
    function visit(mode) {
        if(seen.has(mode))return;seen.add(mode);
        for(let i=0;i<mode.contains.length;i++) {
            const child=mode.contains[i];
            if(child.scope==='attr' && child['on:begin']) {
                expect(mode.contains[i+1].beginRe.source).toBe(child.beginRe.source);
                expect(mode.contains[i+1]['on:begin']).toBeUndefined();
                if(mode.scope==='variable')expect(mode.endRe.source).toBe(String.raw`\B|\b`);
                else expect(mode.contains.at(-1).beginRe.source).toBe(String.raw`\s+`);
                callers.push(mode);
            }
            visit(child);
        }
        if(mode.starts)visit(mode.starts);
    }
    visit(after.getLanguage('perl'));
    expect(callers).toHaveLength(5);
    for(const prefix of ['$1','$x','$!','sub f','class F']) for(const n of [32,64,128]) {
        for(const tail of ['!',': !',':word!',':word(x);',':word(x\ny);','(bad; ! (valid);']) {
            const code=prefix+' '.repeat(n)+tail;
            expect(detailed(after,code)).toEqual(detailed(before,code));
        }
    }
});

test('Perl declaration end span stays activation-local across ordinary emitter reentry', () => {
    for(const code of ['sub f (bad; ! (valid); print 42;', 'sub f :a(x) (z); class F {42;}',
        'sub f '+ '('.repeat(128)+'!']) {
        expect(detailed(after,code,'perl',true)).toEqual(detailed(before,code,'perl',true));
        expect(detailed(after,code)).toEqual(detailed(before,code));
    }
});

function traceMatcher(api, language, scope, code) {
    result(api, 'warmup', language);
    const mode = api.getLanguage(language).contains.find(m => m.scope === scope);
    const exec = mode.matcher.exec;
    const trace = [];
    mode.matcher.exec = function(input) {
        const start = this.lastIndex;
        const match = exec.call(this, input);
        trace.push({ start, index: match?.index, text: match?.[0], type: match?.type });
        return match;
    };
    try { result(api, code, language); } finally { mode.matcher.exec = exec; }
    return trace;
}

test('2p actual combined matchers consume full failed runs and complete successful end lexemes', () => {
    for (const n of [128, 256, 512]) for (const [scope, prefix] of [['function', 'sub f'], ['class', 'class F']]) {
        const gap = ' '.repeat(n);
        const failed = traceMatcher(after, 'perl', scope, prefix + gap + '!');
        expect(failed.some(row => row.text === gap)).toBe(true);
        expect(failed.filter(row => row.text === gap)).toHaveLength(1);
        const suffix = scope === 'function' ? '(x){' : '{';
        const accepted = traceMatcher(after, 'perl', scope, prefix + gap + suffix);
        const original = traceMatcher(before, 'perl', scope, prefix + gap + suffix);
        const originalEnd = original.find(row => row.type === 'end');
        // The native candidate is primitive; the opt-in callback supplies the complete span.
        if(scope === 'function') {
            expect(accepted.some(row => row.type === 'end' && row.text === gap)).toBe(true);
            expect(originalEnd.text).toBe(gap + suffix);
        } else expect(accepted.some(row => row.text === originalEnd.text)).toBe(true);
        expect(detailed(after,prefix+gap+suffix)).toEqual(detailed(before,prefix+gap+suffix));
        compare(prefix + gap + suffix + ' print 42; }', 'perl');
    }
});

test('2p optional argument eligibility does not rescan unterminated suffixes per accepted attribute', () => {
    result(after, 'sub f :a(', 'perl');
    const mode = after.getLanguage('perl').contains.find(m => m.scope === 'function');
    const attrs = mode.contains.filter(m => m.scope === 'attr');
    expect(attrs.length).toBeGreaterThan(0);
    expect(attrs.every(m => !m.beginRe.source.includes('.*?'))).toBe(true);
    const code = 'sub f :a \n(x) print 42;';
    result(before, code, 'perl');
    const originalAttr = before.getLanguage('perl').contains.find(m => m.scope === 'function').contains.find(m => m.scope === 'attr');
    const originalLexeme = originalAttr.beginRe.exec(code);
    const ends = [];
    const exec = attrs[0].matcher.exec;
    attrs[0].matcher.exec = function(input) {
        const match = exec.call(this, input);
        if (match) ends.push(match.index + match[0].length);
        return match;
    };
    try { compare(code, 'perl'); } finally { attrs[0].matcher.exec = exec; }
    expect(ends).toEqual([originalLexeme.index + originalLexeme[0].length, originalLexeme.index + originalLexeme[0].length]);
    const seen = new Set(), callerScopes = new Set();
    let callers = 0;
    function visit(parent) {
        if (seen.has(parent)) return;
        seen.add(parent);
        for (let i = 0; i < parent.contains.length; i++) {
            const child = parent.contains[i];
            if (child.scope === 'attr' && child['on:begin']) {
                expect(parent.contains[i + 1].scope).toBe('attr');
                expect(parent.contains[i + 1]['on:begin']).toBeUndefined();
                expect(child.beginRe.flags).toBe('m');
                callerScopes.add(parent.scope);
                callers++;
            }
            visit(child);
        }
        if (parent.starts) visit(parent.starts);
    }
    visit(after.getLanguage('perl'));
    expect([...callerScopes].sort()).toEqual(['class', 'function', 'variable']);
    console.log('PERL_DISTINCT_COMPILED_ATTR_CALLERS=' + callers);
    for (const n of [64, 128, 256]) {
        compare('sub f' + ' :a('.repeat(n) + '!', 'perl');
        compare('sub f' + ' :a('.repeat(n) + ') print 42;', 'perl');
    }
    for (const code of ['sub f :a \n(x);', 'sub f :a \n(x\ny);', 'sub f :a (x\r y);',
        'class F :a(x\u2028y);', 'my $f :a(x) + 42', '$f :a(x) :b(y);']) compare(code, 'perl');
});

test('Ruby ignored heredoc candidates are never the last begin in any compiled caller', () => {
    result(after, ':<<EOF\nx\nEOF', 'ruby');
    const seen = new Set();
    let callers = 0;
    function visit(mode) {
        if (seen.has(mode)) return;
        seen.add(mode);
        for (let i = 0; i < mode.contains.length; i++) {
            const child = mode.contains[i];
            if (child['on:begin'] && String(child.begin).startsWith('/<<')) {
                expect(i).toBeLessThan(mode.contains.length - 1);
                expect(child.beginRe.flags).toBe('m');
                callers++;
            }
            visit(child);
        }
        if (mode.starts) visit(mode.starts);
    }
    visit(after.getLanguage('ruby'));
    expect(callers).toBeGreaterThan(0);
    console.log('RUBY_DISTINCT_COMPILED_CALLERS=' + callers);
});

test('normal emitter reentry cannot replace eligibility for the outer activation', () => {
    function reentrant(api, code, language) {
        const Emitter = api.highlight('warmup', { language })._emitter.constructor;
        let active = false;
        class Reentrant extends Emitter {
            addText(text) {
                if (!active && (text.includes(':a') || text.includes('EOF'))) {
                    active = true;
                    api.highlight(language === 'ruby' ? '<<OTHER\nx\nOTHER\n42' : 'sub other :b(x);', { language });
                }
                return super.addText(text);
            }
        }
        api.configure({ __emitter: Reentrant });
        try { return result(api, code, language); }
        finally { api.configure({ __emitter: Emitter }); }
    }
    for (const [language, code] of [
        ['ruby', '<<EOF\nx\nEOF\n<<NEXT\ny\nNEXT\nputs 42'],
        ['ruby', ':<<BAD\n!\n:<<EOF\nx\nEOF\n42'],
        ['perl', 'sub f :a(x) :b(y); class F :c(z);'],
        ['perl', 'my $f :a(x) :b(y); sub f :a( :b( !;']
    ]) {
        console.log('REENTRANT_CASE=' + JSON.stringify({ language, code, phase: 'after' }));
        const actual = reentrant(after, code, language);
        console.log('REENTRANT_CASE=' + JSON.stringify({ language, code, phase: 'before' }));
        const expected = reentrant(before, code, language);
        expect(actual).toEqual(expected);
        compare(code, language);
    }
});

test('2u native matcher traces bound heredoc indexing and token probes without suffix lookaheads', () => {
    const context = vm.createContext({ console });
    vm.runInContext(String.raw`
        var regexTrace=[];
        const nativeExec=RegExp.prototype.exec;
        RegExp.prototype.exec=function(input){
            const start=this.lastIndex;
            const result=nativeExec.call(this,input);
            if(this.source.includes('<<[-~]') || this.source===String.raw\`\n[^\S\n]*(\w+)\b\` ||
                (this.sticky && this.source===String.raw\`\w+(?=\W)\`)) {
                regexTrace.push({source:this.source,start,index:result?.index,length:result?.[0].length,
                    sticky:this.sticky});
            }
            return result;
        };
    `.replaceAll('\\`', '`'), context);
    vm.runInContext(candidateSource, context);
    const api = context.hljs;
    const rows = [];
    for (const n of [128, 256, 512]) for (const code of [
        '<<EOF\n' + ' \n'.repeat(n) + '!', '<<EOF\n'.repeat(n) + '!',
        '<<EOF\n' + 'x\n'.repeat(n) + 'EOF\nputs 42'
    ]) {
        context.regexTrace.length = 0;
        expect(result(api, code, 'ruby')).toEqual(result(before, code, 'ruby'));
        const trace = context.regexTrace;
        const combined = trace.filter(row => row.source.includes('<<[-~]'));
        expect(combined.length).toBeGreaterThan(0);
        expect(combined.every(row => !row.source.includes('[^\\n]*\\n(?:[^\\n]*\\n)*?'))).toBe(true);
        const lines = trace.filter(row => row.source === String.raw`\n[^\S\n]*(\w+)\b`);
        const probes = trace.filter(row => row.sticky);
        expect(lines.length).toBeGreaterThan(0);
        // Each index exec searches forward from its previous end, never a suffix restart.
        let lineWidth = 0;
        for (let i = 0; i < lines.length; i++) {
            const row = lines[i];
            if (i) expect(row.start).toBe(lines[i - 1].index + lines[i - 1].length);
            lineWidth += (row.index === undefined ? code.length : row.index + row.length) - row.start;
        }
        let wordWidth = 0;
        for (const row of probes) {
            expect(row.index === undefined || row.index === row.start).toBe(true);
            wordWidth += /^\w*/.exec(code.slice(row.start))[0].length + 1;
        }
        expect(lineWidth).toBeLessThanOrEqual(code.length);
        expect(wordWidth).toBeLessThanOrEqual(code.length * 2);
        rows.push({ n, bytes: code.length, combinedExecs: combined.length, lineWidth, wordWidth });
    }
    console.log('RUBY_HEREDOC_STRUCTURAL_WORK=' + JSON.stringify(rows));
});

test('auto-detection rankings, illegal results and public validation remain unchanged', () => {
    const summary = r => ({ value: r.value, relevance: r.relevance, illegal: r.illegal, language: r.language });
    for (const code of ['sub f :attr (x); print 42;', '<<EOF\nx\nEOF\nputs 42', '<<BAD\n!\n/*', 'class F\n\t!']) {
        const a = after.highlightAuto(code), b = before.highlightAuto(code);
        expect(summary(a)).toEqual(summary(b));
        expect(summary(a.secondBest)).toEqual(summary(b.secondBest));
        compare(code, 'ruby');
        compare(code, 'perl');
    }
    for (const api of [before, after]) {
        expect(() => api.highlight('x', { language: '__missing__' })).toThrow();
        expect(() => api.highlight(null, { language: 'ruby' })).toThrow();
    }
});
