import {restoreSwiftComment as restoreComment} from './fixtures/highlight-swift-reconstruction.cjs';
import { test, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const source = readFileSync(new URL('../../src/js/libs/highlight.pack.js', import.meta.url), 'utf8');
const fixture = JSON.parse(readFileSync(new URL('highlight-vendor-baseline.json', import.meta.url), 'utf8'));
let original;
function load(text = source) {
    const context = vm.createContext({ console });
    vm.runInContext(text, context);
    return context.hljs;
}
beforeAll(() => {
    original = restoreComment(source);
    for (const { start, end, source: body } of fixture.originalFunctions) {
        const from = original.indexOf(start), to = original.indexOf(end, from);
        assert(from >= 0 && to > from, start);
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
});
function run(api, code, language = 'test', ignoreIllegals = false) {
    const r = api.highlight(code, { language, ignoreIllegals });
    expect(r.errorRaised).toBeUndefined();
    return r;
}
function grammar(api, factory) { api.registerLanguage('test', factory); api.debugMode(); return api; }
function summary(r) {
    const tops = [];
    for (let m = r._top; m; m = m.parent) tops.push({scope:m.scope, skip:m.skip, excludeEnd:m.excludeEnd, returnEnd:m.returnEnd});
    return JSON.parse(JSON.stringify({value:r.value, relevance:r.relevance, illegal:r.illegal, language:r.language,
        ir:r._emitter.rootNode, tops}));
}
// Intentional corrections: these grammars must not retain a parent after a rejected last begin.
for (const end of [/ /, /to/]) test(`rejected last comment begin retains same-position parent end ${end}`, () => {
    const api = grammar(load(), h => {
        const mode = h.COMMENT('~', end);
        mode.contains[mode.contains.length - 1] = {begin:/[ ]+|to/, 'on:begin':(m,r)=>r.ignoreMatch()};
        return {contains:[mode]};
    });
    const code = '~ one two three to NEXT ~four to DONE';
    const r = run(api, code);
    const expected = end.source === ' ' ? '~ </span>one' : 'to</span> NEXT';
    expect(r.value).toContain(expected);
    expect(r.value).not.toContain('undefined');
});
test('rejected last root begin retains illegal alternative and later valid begin', () => {
    const api = grammar(load(), () => ({illegal:/!/, contains:[{scope:'title', begin:/[!x]/,
        'on:begin':(m,r) => { if(m[0] === '!')r.ignoreMatch(); }}]}));
    expect(api.highlight('!x', {language:'test', ignoreIllegals:false}).illegal).toBe(true);
    expect(run(api, '!x', 'test', true).value).toBe('!<span class="hljs-title">x</span>');
});
test('ignored zero-width begin is not an entered begin and never emits undefined', () => {
    const api = grammar(load(), () => ({contains:[{scope:'string', begin:/~/, end:/(?=!)/,
        contains:[{begin:/(?=!)/, 'on:begin':(m,r)=>r.ignoreMatch()}]}]}));
    const r = run(api, '~!');
    expect(r.value).toBe('<span class="hljs-string">~</span>!');
    expect(r._top.parent).toBeUndefined();
});
test('all-rejected root candidates preserve the whole input and later accepted candidates', () => {
    const api = grammar(load(), () => ({contains:[{scope:'title', begin:/(?=.)/,
        'on:begin':(m,r)=> { if(m.input[m.index] !== 'x')r.ignoreMatch(); }, end:/x/}]}));
    expect(run(api, '!!x!').value).toBe('!!<span class="hljs-title">x</span>!');
});
test('stock comment phrases and root illegal contexts remain original-compatible', () => {
    for (const [language, code] of [['c', '/* one two three to DONE */ int x;'], ['ini', 'foo'],
        ['graphql', 'BEGIN'], ['swift', 'func f ' + 'a'.repeat(26) + ' '.repeat(26) + '!']]) {
        for(const ignore of [false,true]) expect(summary(run(load(),code,language,ignore)))
            .toEqual(summary(run(load(original),code,language,ignore)));
    }
});
test('Swift actual parameter caller preserves the private rejected zero-width witness', () => {
    let candidate=source;
    if(process.env.HIGHLIGHT_CORE_COUNTERFACTUAL==='1') for(const row of fixture.originalFunctions.slice(0,2)) {
        const from=candidate.indexOf(row.start),to=candidate.indexOf(row.end,from);
        assert(from>=0 && to>from);candidate=candidate.slice(0,from)+row.source+candidate.slice(to);
    }
    const api=load(candidate),reference=load(original);
    const parameters=api.getLanguage('swift').contains[2].contains.find(m=>m.end?.source===String.raw`\)`);
    // Test-only ASCII rejection reproduces the rejected proposal in its real stock caller.
    parameters.contains[0].begin=/(?=[A-Za-z_])/;
    parameters.contains[0]['on:begin']=(m,r)=>r.ignoreMatch();
    api.debugMode(); reference.debugMode();
    for(const open of ['','( ']) {
        const code='func f'+(open||' ')+ 'a'.repeat(26)+' '.repeat(26)+'!';
        expect(summary(run(api,code,'swift'))).toEqual(summary(run(reference,code,'swift')));
    }
});

function endGrammar(callback, extra = {}) {
    return () => ({contains:[{scope:'string', begin:/~/, end:/!/, excludeEnd:true, ...extra, 'on:end':callback},
        {scope:'number', match:/tail|42/}]});
}
test('end-only opt-in consumes the complete excluded span, not the primitive candidate', () => {
    const api = grammar(load(), endGrammar((m,r)=>{ r._endLexeme = '!tail'; }));
    const r = run(api, '~x!tail42');
    expect(r.value).toBe('<span class="hljs-string">~x</span>!tail<span class="hljs-number">42</span>');
    expect(JSON.parse(JSON.stringify(r._emitter.rootNode)).children).toEqual([
        {scope:'string',children:['~x']}, '!tail', {scope:'number',children:['42']}]);
    expect(r._top.parent).toBeUndefined();
});
test('end-span opt-in changes actual consumed length and supports included and wrapped ends', () => {
    for (const extra of [{excludeEnd:false}, {excludeEnd:false,endScope:'punctuation'}]) {
        const api = grammar(load(), endGrammar((m,r)=>{ r._endLexeme = '!tail'; },extra));
        const r = run(api, '~x!tail42');
        expect(r.value).toBe(extra.endScope
            ? '<span class="hljs-string">~x<span class="hljs-punctuation">!tail</span></span><span class="hljs-number">42</span>'
            : '<span class="hljs-string">~x!tail</span><span class="hljs-number">42</span>');
    }
});
test('end-span validation rejects malformed values in debug and reports safe errors without losing data', () => {
    for (const value of ['', 2, null, '!wrong', '!tailX', '!', undefined]) {
        const code = '~x!!tail';
        const callback = (m,r) => { r.data.kept = 'yes'; r._endLexeme = value; };
        // Native candidate is two characters: ! is a forbidden shrink, not an equal span.
        for (const safe of [false,true]) {
            const api = load(); api.registerLanguage('test', endGrammar(callback,{end:/!!/}));
            if (!safe) { api.debugMode(); expect(()=>api.highlight(code,{language:'test'})).toThrow('Invalid end lexeme'); }
            else {
                const r = api.highlight(code,{language:'test'});
                expect(r.errorRaised?.message).toContain('Invalid end lexeme');
                expect(r.value).toBe(code);
                expect(r._top.data.kept).toBe('yes');
            }
        }
    }
});
test('end-span validation uses the actual input and original candidate despite callback mutations', () => {
    for (const [mutate,span] of [
        [m=>{m[0]='!';}, '!'], [m=>{m.input='~x!!wrong';}, '!!wrong'], [m=>{m.index=3;}, '!tail']
    ]) {
        const api = grammar(load(),endGrammar((m,r)=>{mutate(m);r._endLexeme=span;},{end:/!!/}));
        expect(()=>api.highlight('~x!!tail',{language:'test'})).toThrow('Invalid end lexeme');
    }
});

test('ignored and inherited overrides never leak, and recursive endsWithParent accepts its own span', () => {
    const api = grammar(load(), () => ({contains:[{scope:'string',begin:/~/,end:/!/,
        'on:end':(m,r)=>{r._endLexeme='!tail';}, contains:[{scope:'title', begin:/x/,end:/!/,
            endsWithParent:true,'on:end':(m,r)=>{r._endLexeme='BAD';r.ignoreMatch();}}]}, {match:/42/,scope:'number'}]}));
    expect(run(api,'~x!tail42').value).toBe('<span class="hljs-string">~<span class="hljs-title">x!tail</span></span><span class="hljs-number">42</span>');
    const inherited = grammar(load(),endGrammar((m,r)=>{Object.setPrototypeOf(r,{_endLexeme:'BAD'});}));
    expect(run(inherited,'~x!tail42').value).toBe('<span class="hljs-string">~x</span>!<span class="hljs-number">tail</span><span class="hljs-number">42</span>');
});
test('non-opt-in callback lexeme mutations, response keys and shared data semantics stay unchanged', () => {
    for (const text of [source,original]) {
        let seen = [];
        const api = grammar(load(text), endGrammar((m,r)=>{
            seen.push([Object.keys(r).sort(),r.data.n || 0]); r.data.n=(r.data.n||0)+1; m[0]='!changed';
        }));
        expect(run(api,'~x!42~x!42').value).toBe('<span class="hljs-string">~x</span>!<span class="hljs-number">42</span><span class="hljs-string">~x</span>!<span class="hljs-number">42</span>');
        expect(seen).toEqual([[['data','isMatchIgnored'],0],[['data','isMatchIgnored'],1]]);
    }
});
test('end-span state is cleared per match and normal-emitter reentry cannot replace the outer span', () => {
    const api = grammar(load(),endGrammar((m,r)=>{if(m.input[m.index+1]==='t')r._endLexeme='!tail';}));
    const Emitter = run(api,'warmup')._emitter.constructor;
    let entered=false;
    class Reentrant extends Emitter { addText(text) {
        if(!entered && text.includes('~x')) {entered=true;run(api,'~nested!42');}
        return super.addText(text);
    }}
    api.configure({__emitter:Reentrant});
    const r=run(api,'~x!tail42~y!42');
    expect(entered).toBe(true);
    expect(r.value).toBe('<span class="hljs-string">~x</span>!tail<span class="hljs-number">42</span><span class="hljs-string">~y</span>!<span class="hljs-number">42</span>');
    expect(r._emitter.rootNode.children.filter(x=>typeof x==='string')).toEqual(['!tail','!']);
});
test('end-span opt-in rejects multi-capture end scopes rather than inventing captures', () => {
    const api = grammar(load(),()=>({contains:[{begin:/~/,end:[/!/,/!/],endScope:{1:'title',2:'number'},
        'on:end':(m,r)=>{r._endLexeme='!!tail';}}]}));
    expect(()=>api.highlight('~!!tail',{language:'test'})).toThrow('Invalid end lexeme');
});
test('end-span opt-in survives endsParent and returnEnd without changing their control flow', () => {
    const api = grammar(load(),()=>({contains:[{scope:'string',begin:/~/,end:/END/,
        contains:[{scope:'title',begin:/x/,end:/!/,endsParent:true,excludeEnd:true,
            'on:end':(m,r)=>{r._endLexeme='!tail';}}]}, {scope:'number',match:/tail|42/}]}));
    expect(run(api,'~x!tail42').value).toBe('<span class="hljs-string">~<span class="hljs-title">x</span></span>!tail<span class="hljs-number">42</span>');
    const returning=grammar(load(),endGrammar((m,r)=>{r._endLexeme='!tail';},{returnEnd:true,excludeEnd:false}));
    expect(run(returning,'~x!tail42').value).toBe('<span class="hljs-string">~x</span>!<span class="hljs-number">tail</span><span class="hljs-number">42</span>');
});
test('Perl sublanguage continuation resumes its declaration across separate emitted chunks', () => {
    const a=grammar(load(),()=>({contains:[{begin:/</,end:/>/,excludeBegin:true,excludeEnd:true,subLanguage:'perl'}]}));
    const b=grammar(load(original),()=>({contains:[{begin:/</,end:/>/,excludeBegin:true,excludeEnd:true,subLanguage:'perl'}]}));
    for(const code of ['<sub f >< (x); print 42;>', '<sub f (><x); print 42;>',
        '<sub f :a(><x); print 42;>', '<sub f >< (bad; ! (valid); print 42;>']) {
        expect(summary(run(a,code))).toEqual(summary(run(b,code)));
    }
});
test('all 36 languages and 71 aliases preserve raw IR, nonempty chunks, continuation, and ordinary API results', () => {
    const a=load(),b=load(original);
    for(const api of [a,b])api.debugMode();
    expect(a.listLanguages()).toHaveLength(36);
    expect(a.listLanguages()).toEqual(b.listLanguages());
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    function record(api,code,language,ignoreIllegals) {
        const Emitter=api.highlight('',{language})._emitter.constructor;
        const chunks=[];
        class Recording extends Emitter {addText(t){if(t)chunks.push(t);return super.addText(t);}}
        api.configure({__emitter:Recording});
        try {return {result:summary(run(api,code,language,ignoreIllegals)),chunks};}
        finally {api.configure({__emitter:Emitter});}
    }
    const corpus=['','warmup 42','foo = "bar";\n','/* one two three */\n','< & >\n','sub f :a(x); print 42;'];
    const aliases=[];
    for(const language of b.listLanguages()) {
        expect(a.getLanguage(language).aliases).toEqual(b.getLanguage(language).aliases);
        aliases.push(...b.getLanguage(language).aliases||[]);
        for(const code of corpus)for(const ignore of [false,true])expect(record(a,code,language,ignore)).toEqual(record(b,code,language,ignore));
    }
    expect(aliases).toHaveLength(71);
    for(const alias of aliases)expect(record(a,'warmup 42',alias,false)).toEqual(record(b,'warmup 42',alias,false));
});
