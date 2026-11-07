// Actual public callback history, including thrown-error behavior and stale suffix caches.
const assert=require('node:assert/strict');
const {source,core,original,load,hash}=require('./fixtures/highlight-metadata-oracle.cjs');
const {snapshot}=require('./fixtures/highlight-metadata-checks.cjs');
const plain=x=>JSON.parse(JSON.stringify(x));let comparisons=0;
function grammar(text,{unicodeRegex,debug,throwSecond,leading,order}){
 const h=load(text),events=[];let calls=0,shared;
 h.registerLanguage('p',api=>({unicodeRegex,contains:[
  ...(leading?[{begin:/a/,'on:begin':(m,r)=>{events.push(['a',m[0],m.index]);r.ignoreMatch();}}]:[]),
  api.inherit(api.getLanguage('graphql').contains.find(x=>x.scope==='symbol')),
  {begin:/(x)/,'on:begin':(m,r)=>{
   if(shared)assert.equal(r.data,shared);else shared=r.data;
   assert.equal(m.rule.data,r.data);events.push(['x',m[0],m[1],m.index,m.input]);
   r.data.calls=(r.data.calls||0)+1;if(++calls===2&&throwSecond)throw Error('second ordinary callback');r.ignoreMatch();
  }}
 ]}));
 if(debug)h.debugMode();h.highlight('',{language:'p'});const matcher=h.getLanguage('p').matcher;
 for(const offset of order)matcher.getMatcher(offset);
 return code=>{calls=0;events.length=0;let result,thrown;try{result=snapshot(h.highlight(code,{language:'p',ignoreIllegals:false}));}catch(e){thrown=e.message;}
  return plain({calls,events,result,thrown,data:shared||{}});
 };
}
for(const unicodeRegex of [false,true])for(const debug of [false,true])for(const throwSecond of [false,true])for(const leading of [false,true])for(const order of [[],[0,1],[1,0],[2,1,0]]){
 const opts={unicodeRegex,debug,throwSecond,leading,order};
 const run=grammar(source,opts),corrected=grammar(core,opts);
 // The authenticated original with just the independently fixed metadata line has no stale ownership bug.
 const restored=grammar(original.replace('n.position=this.position++,','n=Object.assign({},n,{position:this.position++}),'),opts);
 for(const code of leading?['a x',' x','a x',' x','']:[' x',' x','']){
  const actual=run((' '+code).slice(1));assert.deepEqual(actual,corrected(code));assert.deepEqual(actual,restored(code));
  assert.equal(actual.calls,code?1:0);assert.equal(actual.thrown,undefined);assert.equal(actual.result.error,undefined);comparisons++;
 }
}
console.log(JSON.stringify({status:'fresh/reused mixed ordinary callback histories exact',comparisons,source:hash(source),runtime:process.versions.bun||process.version}));
