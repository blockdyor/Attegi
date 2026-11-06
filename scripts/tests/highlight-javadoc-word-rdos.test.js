import {test,expect,beforeAll} from 'bun:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { undoOwnership } from './fixtures/highlight-metadata-oracle.cjs';
const source=readFileSync(new URL('../../src/js/libs/highlight.pack.js',import.meta.url),'utf8');
const fixture=JSON.parse(readFileSync(new URL('highlight-vendor-baseline.json',import.meta.url),'utf8'));
const hash=s=>createHash('sha256').update(s).digest('hex');
let base;
const start='grmr_java:e=>{',end='grmr_javascript:ge,';
function undo(text,row){const lo=text.indexOf(row.start),hi=text.indexOf(row.end,lo);assert(lo>=0&&hi>lo);return text.slice(0,lo)+row.source+text.slice(hi);}
beforeAll(()=>{
 // Authenticate the exact parent AND original upstream before executing vendor code.
 base=source;const java=fixture.originalFunctions.find(x=>x.start===start);if(java)base=undo(base,java);
 assert.equal(hash(undoOwnership(base)),'db3207f83e2e265714ef15244746c27bfa173fbf870be68d732b77526bee2da7');
 let original=source;for(const row of fixture.originalFunctions)original=undo(original,row);
 original=original.replaceAll('.sort((a,b)=>a<b?-1:a>b?1:0).reverse()', '.sort().reverse()')
 .replace('grmr_wasm:e=>{const','grmr_wasm:e=>{e.regex;const')
 .replace('h=_.concat([{begin:/\\(/','h=_.concat([{begin:/(\\s*)\\(/')
 .replace('  Attegi local maintenance: statement-form mode transforms, explicit UTF-16\n'+'  string sorting, and removal of an unused WASM regex data-property read.\n'+'  Based on upstream 11.12.0; not byte-identical. Recursive JS parameter scan repaired.\n','');
 assert.equal(fixture.sha256,'8ab71eb09c51f501e5e25157d9cff100e46cc29bcbfc744d0b746d451fca7f53');assert.equal(hash(original),fixture.sha256);
 assert.equal(source.slice(0,source.indexOf(start)),base.slice(0,base.indexOf(start)));
 assert.equal(source.slice(source.indexOf(end)),base.slice(base.indexOf(end)));
});
function load(text=source){const ctx=vm.createContext({console});vm.runInContext(text,ctx);return {api:ctx.hljs,ctx};}
function snapshot(r){const top=[];for(let m=r._top;m;m=m.parent)top.push({scope:m.scope,skip:m.skip,excludeEnd:m.excludeEnd,returnEnd:m.returnEnd,data:m.data});return JSON.parse(JSON.stringify({top,value:r.value,relevance:r.relevance,illegal:r.illegal,language:r.language,ir:r._emitter.rootNode,error:r.errorRaised?.message,illegalBy:r._illegalBy&&{index:r._illegalBy.index,context:r._illegalBy.context,message:r._illegalBy.message}}));}
const markers=['TODO','FIXME','NOTE','BUG','OPTIMIZE','HACK','XXX'];
const controls=['abcdef@tag','prefix abcdef@tag suffix','abcdef!','@param foo','a_b9@tag@@tag','123!','éabc😀@tag','@link foo TODO: x','one two three four','a_b123','ab`cd','ab\\cd','ab😀cd','abécd','ab@taglike','abcTODO','abcTOD:','abcTODOX:','abcTODOTODO:','abcFIXMEHACK:','abcXXXTODO:','abc\nxyz','abc\r\nxyz','abc\txyz','abc*/ class A {} /**xyz','abc<TODO:>','abc#','abc</'];
const codes=[...controls,...markers.flatMap(m=>['abc'+m+': fix','abc'+m+': fix@tag','abc'+m+':','abc'+m+':@tag','abc'+m+':abc'+m+':!','abc'+m.slice(0,-1)+':','abc'+m+'X:'])].flatMap(x=>['/** '+x+' */','/** '+x]);
test('Java Javadoc full API preserves interior doctags, raw chunks, EOF and root illegals',()=>{
 const a=load().api,b=load(base).api;
 for(const debug of [false,true]){if(debug){a.debugMode();b.debugMode();}for(const code of [...codes,'/** abcdef! */ #','class A { /** abcTODO: x */ int foo() {} }'])for(const ignoreIllegals of [false,true])expect(snapshot(a.highlight(code,{language:'java',ignoreIllegals}))).toEqual(snapshot(b.highlight(code,{language:'java',ignoreIllegals})));}
});
test('Java aliases, public API, all registrations and auto-detection top two retain parent results',()=>{
 const a=load().api,b=load(base).api;
 expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());expect(Array.from(a.listLanguages())).toEqual(Array.from(b.listLanguages()));expect(a.listLanguages()).toHaveLength(36);
 expect(a.getLanguage('jsp')).toBe(a.getLanguage('java'));
 for(const code of ['/** abcTODO: fix@tag */','/** abcdef@tag */ public class A {}','/** one two three four */']){
  expect(snapshot(a.highlight(code,{language:'jsp'}))).toEqual(snapshot(b.highlight(code,{language:'jsp'})));
  const auto=api=>{const r=api.highlightAuto(code);return {first:snapshot(r),second:r.secondBest&&snapshot(r.secondBest)};};expect(auto(a)).toEqual(auto(b));
 }
});
test('Java guard callbacks keep full lexical spans and explicit additional undefined captures',()=>{
 const runs=[source,base].map(text=>{const {api}=load(text),events=[],doc=api.getLanguage('java').contains[0];
  for(let i=0;i<4;i++)doc.contains[i]['on:begin']=(m,r)=>{events.push({i,match:Array.from(m),index:m.index,input:m.input,type:m.type,position:m.position,keys:Object.keys(r).sort()});r.data.seen=true;};
  const result=snapshot(api.highlight('/** abcdef@tag abcTODO: fix@tag */',{language:'java'}));return {result,events};});
 expect(runs[0].result).toEqual(runs[1].result);expect(runs[0].events.length).toBe(runs[1].events.length);
 for(let i=0;i<runs[1].events.length;i++){const actual=runs[0].events[i],old=runs[1].events[i];expect({...actual,match:undefined}).toEqual({...old,match:undefined});expect(actual.match.slice(0,old.match.length)).toEqual(old.match);expect(actual.match.slice(old.match.length).every(x=>x===undefined)).toBe(true);}
 expect(runs[0].events.filter(x=>x.i===0).map(x=>x.match[0])).toEqual(['abcdef@','fix@']);
});
test('Java sublanguage continuation resumes the same open Javadoc and root illegal context',()=>{
 const runs=[source,base].map(text=>{const {api}=load(text);api.registerLanguage('host',()=>({contains:[{begin:/<java>/,end:/<\/java>/,excludeBegin:true,excludeEnd:true,subLanguage:'java'}]}));
 return ['<java>/** abc</java>text<java>TODO: fix@tag */ #</java>','<java>/** abcdef@</java>text<java>tag */ class A {}</java>'].map(code=>snapshot(api.highlight(code,{language:'host',ignoreIllegals:false})));});expect(runs[0]).toEqual(runs[1]);
});
test('Java custom emitter text boundaries and repeated calls preserve raw emitted chunks',()=>{
 const runs=[source,base].map(text=>{const {api}=load(text),events=[];api.highlight('',{language:'java'});const E=api.highlight('',{language:'java'})._emitter.constructor;
 class Track extends E {addText(s){events.push(['text',s]);super.addText(s);}startScope(s){events.push(['start',s]);super.startScope(s);}endScope(){events.push(['end']);super.endScope();}}
 api.configure({__emitter:Track});const results=[];for(const code of ['/** abcdef@tag */','/** abcTODO: fix@tag */','/** abcTODO:','/** abcdef@tag */'])results.push(snapshot(api.highlight(code,{language:'java'})));return {results,events};});expect(runs[0]).toEqual(runs[1]);
});
test('Javadoc lexical callbacks retain ordinary rejection, mutation and shared data semantics',()=>{
 for(const kind of ['lexical-ignore','always-ignore','lexeme-mutation','index-mutation','data-repeat','nested-reentry'])for(const debug of [false,true]) {
  const runs=[source,base].map(text=>{
   const {api}=load(text),doc=api.getLanguage('java').contains[0];let nested=false;if(debug)api.debugMode();
   doc['on:end']=(m,r)=>{
    r.data.calls=(r.data.calls||0)+1;r.data.lexeme=m[0];r.data.index=m.index;
    if(kind==='lexical-ignore'&&m.index===9&&m[0]==='*/')r.ignoreMatch();
    if(kind==='always-ignore')r.ignoreMatch();
    if(kind==='lexeme-mutation')m[0]='OTHER';
    if(kind==='index-mutation')m.index=0;
    if(kind==='nested-reentry'&&!nested){nested=true;api.highlight('/** nested */',{language:'java',ignoreIllegals:false});nested=false;}
   };
   const results=[];
   for(const code of ['/** abc! */ #','/** abcdef@tag abcTODO: fix */','/** TODO: a FIXME: b NOTE: c BUG: d OPTIMIZE: e HACK: f XXX: g */']) {
    const run=()=>{const r=api.highlight(code,{language:'java',ignoreIllegals:false});results.push({result:snapshot(r),data:JSON.parse(JSON.stringify(doc.data))});};
    run();if(kind==='data-repeat')run();
   }
   return results;
  });
  expect(runs[0]).toEqual(runs[1]);
 }
});
test('complete Java API native interpreter word workloads grow linearly, not suffix quadratically',()=>{
 const r=spawnSync('node',['--regexp-interpret-all',new URL('fixtures/highlight-javadoc-native.cjs',import.meta.url).pathname],{encoding:'utf8',timeout:30000,maxBuffer:16*1024*1024});expect(r.error).toBeUndefined();expect(r.status).toBe(0);
 const rows=[];let active;console.log(r.stdout.split('\n').find(line=>line.startsWith('NATIVE_RUNTIME ')));for(const line of r.stdout.split('\n')){if(line.startsWith('NATIVE_BEGIN '))active={...JSON.parse(line.slice(13)),instructions:0};else if(line.startsWith('NATIVE_END ')){rows.push({...active,...JSON.parse(line.slice(11))});active=undefined;}else if(active&&line.startsWith('pc = '))active.instructions++;}
 for(const kind of ['reject','accept']){const counts=[16,32,64].map(n=>rows.filter(x=>x.n===n&&x.kind===kind).reduce((sum,x)=>sum+x.instructions,0));console.log('NATIVE_COUNTS',kind,counts);expect(counts.every(x=>x>0)).toBe(true);expect(counts[2]).toBeLessThan(counts[1]*2);}
 const targets=rows.filter(x=>x.source.includes('(\\w+@)'));expect(targets.length).toBeGreaterThan(0);expect(targets.every(x=>x.flags==='gm')).toBe(true);
 for(const n of [16,32,64])expect(targets.some(x=>x.n===n&&x.kind==='accept'&&x.index===4&&x.text==='z'.repeat(n)+'@')).toBe(true);
},40000);
