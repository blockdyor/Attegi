import {test, expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
const source = readFileSync(new URL('../../src/js/libs/highlight.pack.js', import.meta.url), 'utf8');
const fixture = JSON.parse(readFileSync(new URL('highlight-vendor-baseline.json', import.meta.url), 'utf8'));
const entry = fixture.originalFunctions.find(x => x.start === 'grmr_markdown:e=>{');
const start = source.indexOf('grmr_markdown:e=>{'), end = source.indexOf('grmr_objectivec:e=>{', start);
const original = entry?.source || source.slice(start, end);
const baseline = source.slice(0,start) + original + source.slice(end);
function load(text) { const c = vm.createContext({console}); vm.runInContext(text,c); c.hljs.debugMode(); return c.hljs; }
const before = load(baseline), after = load(source);
const summarize = r => ({value:r.value, relevance:r.relevance, illegal:r.illegal,language:r.language});
function differential(code, old = before, current = after) {
 const a = current.highlight(code,{language:'markdown'}), b = old.highlight(code,{language:'markdown'});
 expect(summarize(a)).toEqual(summarize(b));
 expect(a.errorRaised).toBeUndefined();
 return a;
}
const suffixes = ['[ref]', '(https://example.org)', '(custom+v1://host)', '(/relative)', '(arbitrary)'];
for (const [v,id] of ['j','k','l','m','n'].entries()) {
 test(`AaGqubYQiPLUZgo8aW2${id}: full API variant recognition and bounded failed search`, () => {
  differential('[label]'+suffixes[v]);
  // Node bounds each full-highlight experiment; setup is outside the timed region.
  const child=spawnSync('node',['-e',`
   const vm=require('node:vm'), fs=require('node:fs'),assert=require('node:assert/strict');
   const c=vm.createContext({console});vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);
   const api=c.hljs;api.debugMode();
   const link=api.getLanguage('markdown').rawDefinition(api).contains.find(x=>x.variants?.length===5);
   let calls=0;
   const variant=link.variants[${v}], recognize=variant['on:begin'];
   assert.equal(variant.begin.source,'\\\\[');
   variant['on:begin']=(match,response)=>{calls++;recognize(match,response)};
   api.registerLanguage('isolated',()=>({contains:[{...link,variants:[variant]}]}));
   api.highlight('warm',{language:'isolated'});
   const rows=[];
   for(const n of [1000,2000,4000,8000]){
    const code='['.repeat(n)+'!<&';
    calls=0;
    const begin=performance.now(),r=api.highlight(code,{language:'isolated'}),ms=performance.now()-begin;
    assert.equal(calls,n);
    assert.equal(r.value,'['.repeat(n)+'!&lt;&amp;');assert.equal(r.relevance,0);assert.equal(r.errorRaised,undefined);
    rows.push({n,ms});
   }
   console.log(JSON.stringify(rows));
  `,new URL('../../src/js/libs/highlight.pack.js',import.meta.url).pathname],{encoding:'utf8',timeout:10000});
  if(child.status!==0)throw new Error(child.stderr || String(child.error));
  expect(child.status).toBe(0);
  const rows=JSON.parse(child.stdout);
  console.log(JSON.stringify({id:`AaGqubYQiPLUZgo8aW2${id}`,rows}));
  // The process timeout bounds a stalled experiment, not asymptotic cost.
 });
}
test('Markdown feature and variant-priority differential corpus',()=>{
 const labels=['','a','a b','a[b','a]b','a\\]b','a\\[b','[nested]','**strong**','*emphasis*','<b>x</b>','a\tb'];
 const urls=['','http://x','https://x','ftp://x','ftps://x','data:x','javascript:x','mailto:x','custom+1.-://x','/a','./x','?q','&x','#x','whatever','x(y)z','a\\)b','<>&\"'];
 for(const label of labels) for(const url of urls) for(const prefix of ['', '!', '**', '> ', '# ']) differential(prefix+'['+label+']('+url+')');
 for(const code of ['[a][b]','![a][b]','[a]: https://x','[a](x) [b][ref]','[a](x)[b](https://x)','[a](x)more](https://x)','[a][b]more](https://x)','[a\nb](x)','[a\rb](x)','[a\u2028b](x)','[a\u2029b](x)','`[a](x)`','**[a](https://x)**','[a](x\ny)','[a](x\ry)','[a](x\u2028y)','[a](x\u2029y)']) differential(code);
 expect(after.listLanguages()).toEqual(before.listLanguages()); expect(after.listLanguages()).toHaveLength(36);
});
test('rejected sequential candidates preserve every link variant and later Markdown modes',()=>{
 const modes=['[definition]: https://example.org','`code`','**strong**','*emphasis*','<b>x</b>','&amp;','# heading','> quote','- bullet','---','    indented','title\n===','```js\nx\n```'];
 for(const sep of ['\n','\r','\u2028','\u2029']){
  const invalid='[a'+sep+'b](x)';
  differential(invalid+' [ok](y)');
  for(const suffix of suffixes){
   const valid='[ok]'+suffix;
   for(const code of [invalid+' '+valid,invalid+' '+valid+' '+invalid+' '+valid,'[bad'+sep+invalid+' '+valid]){
    differential(code);
    for(const wrap of [x=>'**'+x+'**',x=>'*'+x+'*',x=>'# '+x,x=>'> '+x]) differential(wrap(code));
   }
  }
  for(const mode of modes){
   differential(invalid+'\n'+mode);
   differential(invalid+'\n'+mode+'\n'+invalid+' [ok](y)');
  }
 }
});
test('deterministic delimiter/escaping/line-boundary differential fuzz',()=>{
 let seed=48271;
 const pieces=['[',']','(',')','a',' ','\\\\','*','_','\n','\r','\u2028','\u2029','https://','x+1://','/','<&'];
 for(let sample=0;sample<2000;sample++){
  let code='';
  for(let i=0;i<16;i++){seed=(seed*16807)%2147483647;code+=pieces[seed%pieces.length]}
  differential(code);
 }
});
test('complete Markdown grammar bracket-family benchmark',()=>{
 after.highlight('warm',{language:'markdown'});
 const rows=[];
 for(const n of [1000,2000,4000,8000]){
  const code='['.repeat(n)+'!<&',start=performance.now();
  const r=after.highlight(code,{language:'markdown'}),ms=performance.now()-start;
  expect(r.value).toBe('['.repeat(n)+'!&lt;&amp;');expect(r.relevance).toBe(0);expect(r.errorRaised).toBeUndefined();
  rows.push({n,ms});
 }
 console.log(JSON.stringify({family:'complete Markdown',rows}));
});
test('fresh equal decoded buffers retain exact full-highlight results',()=>{
 const child=spawnSync('node',['-e',`
  const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
  const c=vm.createContext({console});vm.runInContext(fs.readFileSync(process.argv[1],'utf8'),c);
  const api=c.hljs;api.debugMode();api.highlight('warm',{language:'markdown'});
  const rows=[];
  for(const n of [16000,32000,64000]){
   const buffer=Buffer.alloc(n+3,91);buffer.write('!<&',n);
   const initial=buffer.toString();
   api.highlight(initial,{language:'markdown'});
   for(let rep=0;rep<2;rep++){
    const code=Buffer.from(buffer).toString();assert.equal(code,initial);
    const start=performance.now(),r=api.highlight(code,{language:'markdown'}),ms=performance.now()-start;
    assert.equal(r.value,'['.repeat(n)+'!&lt;&amp;');assert.equal(r.relevance,0);assert.equal(r.illegal,false);assert.equal(r.errorRaised,undefined);
    rows.push({n,rep,ms});
   }
  }
  console.log(JSON.stringify(rows));
 `,new URL('../../src/js/libs/highlight.pack.js',import.meta.url).pathname],{encoding:'utf8',timeout:60000});
 if(child.status!==0)throw new Error(child.stderr || String(child.error));
 expect(child.status).toBe(0);
 console.log(JSON.stringify({family:'fresh equal decoded buffers',rows:JSON.parse(child.stdout)}));
},65000);
test('nested before:highlight preserves link index state',()=>{
 const current=load(source),old=load(baseline);
 let busy=false,nested=0;
 current.addPlugin({'before:highlight':()=>{
  if(busy)return;
  busy=true;
  try{differential('[inner](https://host) [bad',old,current);nested++;}finally{busy=false;}
 }});
 for(const code of ['[[bad [a](https://x) [empty]() [r][ref]','[a](x)\n[ok](y)','[a](x)\r[ok](y)','[a](x)\u2028[ok](y)','[a](x)\u2029[ok](y)','[a][b]more](https://x)']){
  for(let rep=0;rep<2;rep++)differential(Buffer.from(code).toString(),old,current);
 }
 expect(nested).toBe(12);
});
