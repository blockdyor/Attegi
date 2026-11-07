// Authenticated candidate, accepted4a baseline and strict original; reuse the shared API.
const A=require('./highlight-owned-auth.cjs'),assert=require('node:assert/strict');
const {restoreIni}=require('./fixtures/highlight-ini-reconstruction.cjs');
const fs=require('node:fs'),hash=A.hash,json=A.json,record=A.record;
const source={baseline:restoreIni(A.source),counterfactual:A.source,original:A.original};
const binding=Object.fromEntries(Object.entries(source).map(([k,v])=>[k,hash(v)]));
const load=(k='counterfactual',text=source[k])=>A.load(text);
module.exports={A,fs,assert,hash,binding,source,load,json,record};
if(require.main===module){
const apis=['baseline','counterfactual','original'].map(k=>load(k));let groups=0,inputs=0,pairs=0;const rows=[];
function group(name,codes,language='ini',active=apis){groups++;assert(groups<=100);for(const debug of [false,true]){for(const a of active)a[debug?'debugMode':'safeMode']();for(const ignore of [false,true])for(const code of codes){inputs++;const r=active.map(a=>record(a,code,language,ignore));for(let i=1;i<r.length;i++){assert.deepEqual(r[i],r[0],name+':'+JSON.stringify(code)+':'+ignore+':'+debug);pairs++;}}}rows.push({name,codes:codes.length});}
const cases={
empty:['',' ','\n','\t'],illegal:['foo','zBEGIN','!','foo = #comment',' foo=','foo = \n#x'],
bare:['a=1','abc = true','A-B_09 = 4','0=1','-=x','_=x'],
suffix:['!abc=1','x!abc=1','x y=1','foo . bar = 1','foo..bar=1','foo . = 1'],
quoted:['"a"=1',"'a'=1",'""=1',"''=1",'"a\\"b"=1','"a\\"=1',"'a\\b'=1"],
quote_fail:['"a','"a\\"x','"a" #x',"'a",'"a" . "b" = #'],
whitespace:['a\t.\r\nb = \t1','a\u00a0=\u20281','a\ufeff.\u2003b=1','a\v=\f1','a\r\n=\r\n1'],
unicode:['ſ=1','K=1','aſ=1','é=1','"é😀"=1',"'\udc00'=1",'\udc00a=1','😀a=1'],
body:['x=123\ny=false','x=[true,1,"foo",[2]]','x="hello" # comment','x=\'\'\'multiline\ntext\'\'\'','[section]\na.b=1'],
separators:['a\u2028b=1','a\u2029b=1','"a\nb"=1',"'a\nb'=1"],
priority:['# a=1\na=2',';a=1\na=2','[[a]]\na=3','[x]\na=2','# TODO: a is so to '],
};for(const [name,codes] of Object.entries(cases))group(name,codes);
const {input:richInput,families}=require('./fixtures/highlight-ini-cases.cjs');
for(const family of families)group(family,[16,32].map(n=>richInput(family,n)));
for(const n of [16,32,64])group('bounded-'+n,['z'.repeat(n)+' '.repeat(n)+'=#','z'.repeat(n)+' '.repeat(n)+'=1',('a . ').repeat(n)+'z=1',('a . ').repeat(n)+'z=#','"'+('a\\"').repeat(n)+'z"=1','"'+('a\\"').repeat(n)+'z"=#']);
let seed=1741;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};const chars=['a','Z','0','_','-','"',"'",'\\','.',' ','\t','=','\n','#','😀'];for(let b=0;b<12;b++){const codes=[];for(let j=0;j<20;j++){let s='';for(let z=0,n=rand()%22;z<n;z++)s+=chars[rand()%chars.length];codes.push(s);}group('seeded-'+b,codes);}
// The raw stock grammar remains byte-derived; compare own public fields, regexes and functions before compile.
function raw(x,seen=new Map){if(x===null||typeof x!=='object')return typeof x==='function'?String(x):x;if(seen.has(x))return {ref:seen.get(x)};seen.set(x,seen.size);if(Object.prototype.toString.call(x)==='[object RegExp]')return {re:x.source,flags:x.flags};return Object.fromEntries(Reflect.ownKeys(x).map(k=>[k,raw(x[k],seen)]));}
assert.deepEqual(raw(load('baseline').getLanguage('ini')),raw(load().getLanguage('ini')));groups++;rows.push({name:'public-raw-shape'});
const a=load(),g=a.getLanguage('ini'),target=g.contains.at(-1),rawBegin=target.begin;a.highlight('a=1',{language:'ini'});const native=g.matcher.getMatcher(0).matcherRe;assert.equal(native.flags,'gim');assert.equal(target.begin,rawBegin);assert(!native.source.includes(target.beginRe.source));assert(native.source.includes('[A-Za-z0-9_'));assert.equal(g.matcher.hasOwnedFilter,true);rows.push({name:'compiled-activation',selector:native.source,flags:native.flags,begin:target.beginRe.source});groups++;
// Changed/accessor/inherited/callback rules must use the unmodified public fallback.
for(const kind of ['callback','accessor','inherit','freeze','contains','root']){const active=['baseline','counterfactual'].map(k=>{const a=load(k),g=a.getLanguage('ini'),t=g.contains.at(-1);if(kind==='callback')t['on:begin']=(m,r)=>{r.data.seen=[m[0],m.index,m.slice(1)];if(m[0]==='bad')r.ignoreMatch();};if(kind==='accessor'){const b=t.begin;Object.defineProperty(t,'begin',{enumerable:true,configurable:true,get(){return t.isCompiled?'custom':b;}});}if(kind==='inherit')g.contains[g.contains.length-1]=a.inherit(t,{'on:begin':(m,r)=>{r.data.m=m[0];}});if(kind==='freeze')Object.freeze(t);if(kind==='contains')t.contains=[{begin:/a/,scope:'title'}];if(kind==='root')a.registerLanguage('ini',()=>t);return a;});group('guard-'+kind,['a=1','bad=1','custom=1','abc = #','"a"=1'],'ini',active);}
// Same actual target, different selecting parent flags and orders, never the first beginRe flags.
for(const order of [false,true]){const active=['baseline','counterfactual'].map(k=>{const a=load(k),t=a.getLanguage('ini').contains.at(-1);a.registerLanguage('fold',()=>({unicodeRegex:true,case_insensitive:true,contains:[t],illegal:/\S/}));if(order)a.highlight('a=1',{language:'fold'});else a.highlight('a=1',{language:'ini'});return a;});group('shared-flags-'+order,['K=1','ſ=1','aſ=1','x=1','"😀"=1'],'fold',active);group('stock-after-flags-'+order,['K=1','ſ=1','aſ=1','x=1'],'ini',active);}
// Reentry through the actual emitter, not synthetic callbacks or payloads.
for(const k of ['baseline','counterfactual']){const a=load(k),E=a.highlight('',{language:'ini'})._emitter.constructor;let depth=0,nested=[];class R extends E{addText(t){if(t&&!depth){depth++;try{nested.push(record(a,'other.key = [1, 2]','ini',true));}finally{depth--;}}return super.addText(t);}}a.configure({__emitter:R});const r=a.highlight('a . b = "value"\nz = true',{language:'ini',ignoreIllegals:false});const row=json({value:r.value,tree:r._emitter.rootNode,relevance:r.relevance,illegal:r.illegal,nested});if(k==='baseline')globalThis.reentry=row;else assert.deepEqual(row,globalThis.reentry);}groups++;rows.push({name:'emitter-reentry'});
const witness='z'.repeat(16)+' '.repeat(16)+'=#';
for(const debug of [false,true]){const a=load();a[debug?'debugMode':'safeMode']();const r=record(a,witness,'ini',false);assert.deepEqual(r.illegalBy,{index:0,context:witness,message:'Illegal lexeme "z" for mode "<unnamed>"',resultSoFar:''});}groups++;rows.push({name:'exact-illegal-index-and-context'});
for(const flags of ['m','mi','mu','miu'])for(const stockFirst of [false,true]){const active=['baseline','counterfactual'].map(k=>{const a=load(k),t=a.getLanguage('ini').contains.at(-1);a.registerLanguage('p',()=>({unicodeRegex:flags.includes('u'),case_insensitive:flags.includes('i'),contains:[t],illegal:/\S/}));a.highlight('a=1',{language:stockFirst?'ini':'p'});return a;});group('current-flags-'+flags+'-'+stockFirst,['K=1','ſ=1','aſ=1','"😀"=1','"a\\"b" . z = #'],'p',active);}
const registrations=text=>{const ms=Array.from(text.matchAll(/grmr_([a-z0-9_]+):/g));assert.equal(ms.length,36);return new Map(ms.map((m,i)=>[m[1],text.slice(m.index,ms[i+1]?.index||text.length)]));};
// Scope this byte invariant to the historical INI2g delta; behavioral APIs use the full candidate.
const {restoreBatch}=require('./fixtures/highlight-batch-reconstruction.cjs');
const old=registrations(source.baseline),now=registrations(restoreBatch(source.counterfactual));let unchanged=0;for(const [name,body]of old)if(name!=='ini'){assert.equal(now.get(name),body,name);unchanged++;}assert.equal(unchanged,35);
const b=load('baseline'),c=load();assert.deepEqual(Object.keys(c).sort(),Object.keys(b).sort());assert.deepEqual(Array.from(c.listLanguages()),Array.from(b.listLanguages()));const aliases=c.listLanguages().flatMap(l=>Array.from(c.getLanguage(l).aliases||[]));assert.equal(aliases.length,71);for(const alias of aliases)assert.equal(c.getLanguage(alias).name,b.getLanguage(alias).name);assert.equal(hash(fs.readFileSync(__dirname+'/highlight-vendor-baseline.json')),'b4ae03eff0a2bafe8a71c902e73e71f4a2297b81d539481d0b185e5d0e7debf2');groups++;rows.push({name:'source-api-authentication',unchangedOtherLanguages:unchanged,languages:36,aliases:aliases.length});
const result={status:'PASS',runtime:process.versions,groups,individualInputPolicyModeExecutions:inputs,comparisonPairs:pairs,rows,binding,probe:hash(fs.readFileSync(__filename))};console.log(JSON.stringify(result));
}
