const assert=require('node:assert/strict');
const A=require('./highlight-owned-auth.cjs');
const rows=[],failures=[];
for(const via of ['raw','inherit','extension'])for(const debug of [false,true])for(const ignoreIllegals of [false,true]){
 const outputs={};
 for(const [variant,text]of Object.entries({original:A.original,core:A.base,candidate:A.source})){
  const api=A.load(text);let s=api.getLanguage('graphql').contains.find(m=>m.scope==='symbol');if(via==='inherit')s=api.inherit(s);
  const originalBegin=s.begin;
  function customize(m){Object.defineProperty(m,'begin',{enumerable:true,configurable:true,get(){return this.isCompiled?/custom/:originalBegin;}});}
  if(via!=='extension')customize(s);
  api.registerLanguage('p',()=>({contains:[s],compilerExtensions:via==='extension'?[m=>{if(m===s)customize(m);}]:[]}));
  api[debug?'debugMode':'safeMode']();
  const r=A.record(api,'custom abc:','p',ignoreIllegals);
  outputs[variant]={value:r.value,chunks:r.chunks,beginRe:s.beginRe.source,combined:api.getLanguage('p').matcher.getMatcher(0).matcherRe.source};
 }
 assert.equal(outputs.original.value,outputs.core.value);assert.equal(outputs.core.beginRe,'custom');
 const differs=outputs.candidate.value!==outputs.core.value;try{assert.deepEqual(outputs.candidate,outputs.core);}catch(e){failures.push({via,debug,ignoreIllegals,message:e.message});}
 rows.push({via,debug,ignoreIllegals,differs,outputs});
}
console.log(JSON.stringify({runtime:process.versions,sourceHash:A.hash(A.source),rows,failures},null,2));assert.equal(failures.length,0,`${failures.length}/${rows.length} accessor mismatches`);
