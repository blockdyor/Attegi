const {A,fs,assert,hash,binding,source,load,json,record}=require('./highlight-ini-probe.cjs');let groups=0,inputs=0,pairs=0;const rows=[];
function compare(name,codes,setup){groups++;const active=['baseline','counterfactual'].map(k=>{const a=load(k),events=[];setup(a,events);return {a,events};});for(const debug of [false,true]){for(const x of active)x.a[debug?'debugMode':'safeMode']();for(const ignore of [false,true])for(const code of codes){inputs++;const rs=active.map(x=>{x.events.length=0;let r;try{r=record(x.a,code,'p',ignore);}catch(e){r={thrown:e.message};}return {r,events:json(x.events)};});assert.deepEqual(rs[1],rs[0],name+JSON.stringify({code,debug,ignore}));pairs++;}}rows.push({name,codes:codes.length});}
for(const action of ['observe','ignore','throw','reenter'])compare('ordinary-before-owned-'+action,['z=1','z! later=2','z z z = #','zz=1','"z"=1'],(a,events)=>{const t=a.getLanguage('ini').contains.at(-1);a.registerLanguage('p',()=>({case_insensitive:true,contains:[{begin:/z/,relevance:0,'on:begin':(m,r)=>{events.push([m[0],m.index,m.slice(1)]);r.data.seen=(r.data.seen||0)+1;if(action==='throw')throw Error('ordinary budget');if(action==='reenter')a.highlight('nested = 1',{language:'ini'});if(action!=='observe')r.ignoreMatch();}},t],illegal:/!/}));});
for(const action of ['observe','ignore','throw','reenter'])compare('ordinary-parent-end-'+action,['~a=1 END','~foo! END','~a . b=2 END','~"x"=1 END'],(a,events)=>{const t=a.getLanguage('ini').contains.at(-1);a.registerLanguage('p',()=>({case_insensitive:true,contains:[{begin:/~(a)?/,end:/(END)/,contains:[t],illegal:/!/,'on:begin':m=>events.push(['begin',m[0],m.index,m.slice(1)]),'on:end':(m,r)=>{events.push(['end',m[0],m.index,m.slice(1)]);if(action==='throw')throw Error('parent end');if(action==='reenter')a.highlight('nested = 1',{language:'ini'});if(action==='ignore')r.ignoreMatch();}}]}));});
// Test instrumentation is a unique delta from authenticated source, loaded through owned-auth.
let text=source.counterfactual;const marker='const full=owned.select(input,match.index,flags);';assert.equal(text.split(marker).length,2);text=text.replace(marker,marker+'if(match.rule.scope==="attr")hljs.__iniSelections.push({full,input,at:match.index,flags,begin:match.rule.beginRe.source});')+';hljs.__iniSelections=[];';
const api=load('counterfactual',text);api.debugMode();const {input:richInput,families}=require('./fixtures/highlight-ini-cases.cjs');for(const code of [...families.flatMap(f=>[16,32].map(n=>richInput(f,n))),'foo','"a\\"b".\'c\'=1','a . b = #','foo = 1','!later=2',"'a.b'=1",'"a\\"=1','a\u2003.\nb=1','"😀"=1']){api.highlight(code,{language:'ini',ignoreIllegals:true});inputs++;}
for(const family of ['quoted-success','dotted-success'])for(const n of [16,32]){const code=richInput(family,n),hits=api.__iniSelections.filter(r=>r.input===code&&r.full!==null);assert.equal(hits.length,1);assert.equal(hits[0].at,0);assert.equal(hits[0].full[0],family==='quoted-success'?'"head\\"':code.slice(0,-3));}
let selections=0,positives=0;for(const {full,input,at,flags,begin}of api.__iniSelections){const native=new RegExp(begin,flags+'y');native.lastIndex=at;const expected=native.exec(input);assert.deepEqual(full===null?null:json([...full]),expected===null?null:json([...expected]));if(full!==null){assert.equal(full.length,expected.length);assert.equal(full.index,expected.index);assert.equal(full.input,input);assert.equal(Object.prototype.toString.call(full),'[object Array]');assert.notEqual(full[0],'');positives++;}selections++;}assert(selections>0&&positives>0);groups++;rows.push({name:'actual-native-match-array-captures',selections,positives});
for(const action of ['observe','ignore','throw','reenter'])compare('key-callback-'+action,['a=1','a . b=2','"a\\"b"=1','abc = #'],(a,events)=>{const t=a.getLanguage('ini').contains.at(-1);t['on:begin']=(m,r)=>{events.push([m[0],m.index,m.slice(1)]);r.data.seen=m[0];if(action==='ignore')r.ignoreMatch();if(action==='throw')throw Error('key callback');if(action==='reenter')a.highlight('nested: 1',{language:'graphql'});};a.registerLanguage('p',()=>({case_insensitive:true,contains:[t],illegal:/\S/}));});
for(const stage of ['begin','end'])for(const action of ['observe','ignore','mutate','mutate-index','data','reenter','throw'])compare('late-key-'+stage+'-'+action,['a=1','a . b=2','"a\\\\\"b"=1','bad = #'],(a,events)=>{const t=a.getLanguage('ini').contains.at(-1);a.registerLanguage('p',()=>({case_insensitive:true,contains:[t],illegal:/\S/}));a.highlight('',{language:'p'});let entered=false;t['on:'+stage]=(m,r)=>{events.push([m[0],m.index,m.slice(1)]);if(action==='ignore')r.ignoreMatch();if(action==='mutate')m[0]='Q';if(action==='mutate-index')m.index=Math.max(0,m.index-1);if(action==='data'){r.data.calls=(r.data.calls||0)+1;assert.equal(r.data,m.rule.data);events.push(r.data.calls);}if(action==='throw')throw Error('late key callback');if(action==='reenter'&&!entered){entered=true;a.highlight('nested = 1',{language:'p'});}};});
// Fresh equal-valued decoded buffers: actual V8 identity on hits, with a failing negative control.
// Constant trusted V8 intrinsic only; no input or interpolation becomes executable code.
if(!process.versions.bun){
 function cacheTrial(negative,code){
  let t=source.counterfactual;
  const start='function ownIni(rule){',end='function ownSwift(rule,two){';
  assert.equal(t.split(start).length,2);assert.equal(t.split(end).length,2);
  const lo=t.indexOf(start),hi=t.indexOf(end,lo),prefix=t.slice(0,lo),suffix=t.slice(hi);t=t.slice(lo,hi);
  const entry='const select=(input,at,flags)=>{\nif(input!==cachedInput||flags!==cachedFlags){';
  assert.equal(t.split(entry).length,2);
  t=t.replace(entry,'const select=(input,at,flags)=>{\nconst cacheHit=input===cachedInput&&flags===cachedFlags;\nif(input!==cachedInput||flags!==cachedFlags){');
  const tail='cachedInput=input;if(!eligible[at])return null;';assert.equal(t.split(tail).length,2);
  t=t.replace(tail,(negative?'if(cachedInput===undefined)cachedInput=input;':'cachedInput=input;')+'hljs.__iniCache.push({hit:cacheHit,same:%IsSameHeapObject(cachedInput,input)});if(!eligible[at])return null;');
  t=prefix+t+suffix+';hljs.__iniCache=[];';
  const api=load('counterfactual',t),same=new Function('a','b','return %IsSameHeapObject(a,b)'),passes=[];let previous;
  for(let i=0;i<3;i++){
   const current=Buffer.from(code).toString();if(previous!==undefined)assert(!same(previous,current));
   const from=api.__iniCache.length;api.highlight(current,{language:'ini',ignoreIllegals:true});previous=current;
   const checks=api.__iniCache.slice(from);assert(checks.length>0);
   passes.push({checks:checks.length,hits:checks.filter(r=>r.hit).length,failed:checks.filter(r=>!r.same).length});
  }
  return {source:hash(t),passes};
 }
 const cases=[];
 for(const code of ['fresh . equal = 1','fresh . equal = #']){
  const good=cacheTrial(false,code),negative=cacheTrial(true,code);
  assert(good.passes.every(p=>p.failed===0));assert(good.passes.slice(1).every(p=>p.hits===p.checks));
  assert.equal(negative.passes[0].failed,0);assert(negative.passes.slice(1).every(p=>p.failed===p.checks));
  cases.push({code,good,negative,negativeControlFailures:negative.passes.filter(p=>p.failed>0).length});
 }
 groups++;rows.push({name:'fresh-equal-reference',cases,negativeControlFailures:cases.reduce((n,c)=>n+c.negativeControlFailures,0)});
}
console.log(JSON.stringify({status:'PASS',runtime:process.versions,groups,individualInputPolicyModeExecutions:inputs,comparisonPairs:pairs,rows,binding,probe:hash(fs.readFileSync(__filename))}));
