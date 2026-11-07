// Real V8 heap-reference check, not a timing or regexp-instruction proxy.
// The native intrinsic exists only inside test-instrumented, authenticated source.
const assert=require('node:assert/strict');
assert.equal(process.versions.bun,undefined,'cache-reference probe requires real Node/V8');
const A=require('./highlight-owned-auth.cjs');
const rebind='// Equal-valued decoded strings must rebind the current reference on cache hits too.\ncachedInput=input;\n';
const assignment='cachedFlags=flags;eligible=next;full=native;';
assert.equal(A.source.split(rebind).length,2);
assert.equal(A.source.split(assignment).length,2);
const broken=A.source.replace(rebind,'').replace(assignment,'cachedInput=input;'+assignment);
assert.equal(A.hash(broken),'dd2d9cbe702dd0e0f384498f4051c3eb51e87946de100f813c747dd4b302b9c1');
const needle='if(!eligible[at])return null;';
function check(source,code){
 assert.equal(source.split(needle).length,2);
 const instrumented=source.replace(needle,'if(!%IsSameHeapObject(input,cachedInput))throw Error("unrebound equal-value COMMENT input");'+needle);
 const api=A.load(instrumented);api.registerLanguage('cache',h=>({contains:[h.COMMENT('~','END')]}));
 for(let pass=0;pass<3;pass++){
  const input=Buffer.from(code,'utf8').toString('utf8');
  const result=api.highlight(input,{language:'cache',ignoreIllegals:true});
  if(result.errorRaised)return {pass,error:String(result.errorRaised)};
 }
 return null;
}
for(const suffix of ['!',"can't foo-bar abc END",'TODO: END']){
 const code='~'+' '.repeat(256)+suffix,red=check(broken,code);
 assert.equal(red?.pass,1);assert.match(red.error,/unrebound equal-value COMMENT input/);
 assert.equal(check(A.source,code),null);
}
console.log(JSON.stringify({runtime:process.version,execPath:process.execPath,source:A.hash(A.source),negativeControl:A.hash(broken),cases:3,freshDecodedPasses:3,heapReferenceInvariant:true}));
