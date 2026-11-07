import {restoreSwiftComment as restoreComment} from './fixtures/highlight-swift-reconstruction.cjs';
import { test, expect, beforeAll } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { undoOwnership, restoreOwned } from './fixtures/highlight-metadata-oracle.cjs';
const source=readFileSync(new URL('../../src/js/libs/highlight.pack.js',import.meta.url),'utf8');
const fixture=JSON.parse(readFileSync(new URL('highlight-vendor-baseline.json',import.meta.url),'utf8'));
const old='n.compile(),this.multiRegexes[e]=n,n}resumingScanAtSamePosition(){';
const fixed='// Resumed matches are usable only at the current position; do not search a discarded suffix.\n'+'n.compile(),e&&n.matcherRe&&(n.matcherRe=RegExp(n.matcherRe.source,n.matcherRe.flags+"y")),this.multiRegexes[e]=n,n}resumingScanAtSamePosition(){';
let base;
beforeAll(()=>{
    // Undo the independently pinned Java repair before authenticating the reviewed core parent.
    const java=fixture.originalFunctions.find(row=>row.start==='grmr_java:e=>{');
    const commentBase=restoreComment(source);
    const lo=commentBase.indexOf(java.start),hi=commentBase.indexOf(java.end,lo);
    assert(lo>=0&&hi>lo);
    const coreParent=commentBase.slice(0,lo)+java.source+commentBase.slice(hi);
    assert.equal(createHash('sha256').update(undoOwnership(restoreOwned(coreParent))).digest('hex'),'db3207f83e2e265714ef15244746c27bfa173fbf870be68d732b77526bee2da7');
    base=source.replace(fixed,old);
    assert.equal(createHash('sha256').update(undoOwnership(restoreOwned(coreParent).replace(fixed,old))).digest('hex'),'403710522aeafacee7eb3fd3978d66ea5408ec2795eec816ec6ae3d62f501975');
    let original=restoreComment(source);
    for(const row of fixture.originalFunctions) {
        const lo=original.indexOf(row.start),hi=original.indexOf(row.end,lo);
        assert(lo>=0&&hi>lo);original=original.slice(0,lo)+row.source+original.slice(hi);
    }
    original=original.replaceAll('.sort((a,b)=>a<b?-1:a>b?1:0).reverse()', '.sort().reverse()')
        .replace('grmr_wasm:e=>{const','grmr_wasm:e=>{e.regex;const')
        .replace('h=_.concat([{begin:/\\(/','h=_.concat([{begin:/(\\s*)\\(/')
        .replace('  Attegi local maintenance: statement-form mode transforms, explicit UTF-16\n'+
            '  string sorting, and removal of an unused WASM regex data-property read.\n'+
            '  Based on upstream 11.12.0; not byte-identical. Recursive JS parameter scan repaired.\n','');
    assert.equal(fixture.sha256,'8ab71eb09c51f501e5e25157d9cff100e46cc29bcbfc744d0b746d451fca7f53');
    assert.equal(createHash('sha256').update(original).digest('hex'),fixture.sha256);
});
function load(text=source){const ctx=vm.createContext({console});vm.runInContext(text,ctx);return ctx.hljs;}
function snapshot(r){const top=[];for(let m=r._top;m;m=m.parent)top.push({scope:m.scope,skip:m.skip,excludeEnd:m.excludeEnd,returnEnd:m.returnEnd});return JSON.parse(JSON.stringify({value:r.value,relevance:r.relevance,illegal:r.illegal,index:r._illegalBy?.index,ir:r._emitter.rootNode,top,error:r.errorRaised?.message}));}
function language(api,flags={}){api.registerLanguage('custom',()=>({...flags,contains:[{begin:/~/,end:/END$/,contains:[{begin:/ /,'on:begin':(m,r)=>r.ignoreMatch()}]}]}));api.debugMode();api.highlight('~ END',{language:'custom'});return api.getLanguage('custom').contains[0].matcher;}
test('resumed native matcher attempts only the current position, never a future suffix',()=>{
    for(const flags of [{},{case_insensitive:true},{unicodeRegex:true},{case_insensitive:true,unicodeRegex:true}]) {
        const matcher=language(load(),flags),full=matcher.getMatcher(0).matcherRe,point=matcher.getMatcher(1).matcherRe;
        expect(full.global).toBe(true);expect(full.sticky).toBe(false);
        expect(point.flags).toBe(full.flags+'y');
        point.lastIndex=0;expect(point.exec('xEND')).toBe(null);
        point.lastIndex=0;expect(point.exec('xENDx')).toBe(null);
        point.lastIndex=1;expect(point.exec('xEND')?.[0]).toBe('END');
        expect(matcher.getMatcher(1).matcherRe).toBe(point);
        expect(matcher.getMatcher(matcher.rules.length).exec('anything')).toBe(null);
    }
});
test('Unicode low-surrogate point results retain the exact-index rejection and fallback',()=>{
    const seen=[];
    for(const text of [source,base]) {
        const api=load(text);api.registerLanguage('custom',()=>({unicodeRegex:true,contains:[{begin:/~/,end:/./u,contains:[{begin:/ /,'on:begin':(m,r)=>r.ignoreMatch()}]}]}));
        api.highlight('~x',{language:'custom'});const m=api.getLanguage('custom').contains[0].matcher;
        const suffix=m.getMatcher(1);suffix.lastIndex=1;const point=suffix.exec('😀END');
        // Engines may reject a low-surrogate start or back up to its high surrogate.
        if(text===source)expect([-1,0]).toContain(point?.index??-1);
        m.regexIndex=1;m.lastIndex=1;const result=m.exec('😀END');
        seen.push({index:result?.index,text:result?.[0],offset:m.regexIndex});
    }
    expect(seen[0]).toEqual(seen[1]);expect(seen[0].index).toBe(2);
});
test('COMMENT illegal metadata and callback capture order stay exactly reviewed',()=>{
    for(const n of [1,2,4,8])for(const ignoreIllegals of [false,true]) {
        const runs=[source,base].map(text=>{
            const api=load(text);api.registerLanguage('custom',h=>({contains:[h.COMMENT('~',/END$/,{illegal:/!/})]}));
            return snapshot(api.highlight('~'+' '.repeat(n)+'!',{language:'custom',ignoreIllegals}));
        });
        expect(runs[0]).toEqual(runs[1]);if(!ignoreIllegals)expect(runs[0].index).toBe(1);
    }
    const runs=[source,base].map(text=>{
        const captures=[],api=load(text),save=(m,r)=>captures.push({match:Array.from(m),index:m.index,input:m.input,type:m.type,position:m.position,keys:Object.keys(r).sort()});
        api.registerLanguage('custom',()=>({contains:[{begin:/xy/,'on:begin':(m,r)=>r.ignoreMatch()},{scope:'title',begin:/(x)(y)/,end:/(;)(z)?/,'on:begin':save,'on:end':save}]}));
        return {result:snapshot(api.highlight('xy;z xy;',{language:'custom',ignoreIllegals:false})),captures};
    });
    expect(runs[0]).toEqual(runs[1]);expect(runs[0].captures).toHaveLength(4);
    expect(runs[0].captures[0].match).toEqual(['xy','x','y']);
});
test('same-position suffix captures, EOF, multiline, Unicode and fallback semantics equal reviewed core',()=>{
    const cases=[
        ['~  END',{}],['~  ENDx',{}],['~  END\ntrailing',{}],['~  end',{case_insensitive:true}],
        ['~  😀END',{unicodeRegex:true}],['~\ud83d END',{unicodeRegex:true}],['~\udc00 END',{unicodeRegex:true}],
        ['xx;',{},()=>({contains:[{begin:/x/,'on:begin':(m,r)=>{if(!m.index)r.ignoreMatch();}},{scope:'title',begin:/(x)/,end:/(;)/} ]})],
        ['[!',{},()=>({contains:[{begin:/\[/,end:/(!)/,contains:[{begin:/!/,'on:begin':(m,r)=>r.ignoreMatch()}]}]})],
        ['!',{},()=>({illegal:/(!)/,contains:[{begin:/!/,'on:begin':(m,r)=>r.ignoreMatch()}]})],
        ['',{},()=>({contains:[{begin:/$/,'on:begin':(m,r)=>r.ignoreMatch()}]})],
        ['[',{},()=>({contains:[{begin:/\[/,end:/$/,contains:[{begin:/$/,'on:begin':(m,r)=>r.ignoreMatch()}]}]})],
        ['😀!',{unicodeRegex:true},()=>({unicodeRegex:true,illegal:/😀/,contains:[{begin:/😀/,'on:begin':(m,r)=>r.ignoreMatch()}]})],
        ['a😀z',{unicodeRegex:true},()=>({unicodeRegex:true,contains:[{begin:/a/,'on:begin':(m,r)=>r.ignoreMatch()},{scope:'title',begin:/(😀)(z)/}]})]
    ];
    for(const [code,flags,grammar] of cases)for(const ignoreIllegals of [false,true]) {
        const apis=[load(),load(base)];for(const api of apis){if(grammar)api.registerLanguage('custom',grammar);else language(api,flags);api.debugMode();}
        expect(snapshot(apis[0].highlight(code,{language:'custom',ignoreIllegals}))).toEqual(snapshot(apis[1].highlight(code,{language:'custom',ignoreIllegals})));
    }
});
