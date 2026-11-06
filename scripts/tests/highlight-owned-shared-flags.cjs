const assert=require('node:assert/strict');
const A=require('./highlight-owned-auth.cjs');
const rows=[],failures=[];
for(const order of [['fold','graphql'],['graphql','fold']])for(const debug of [false,true])for(const ignoreIllegals of [false,true]){
 const results={};
 for(const [variant,text]of Object.entries({original:A.original,core:A.base,candidate:A.source})){
  const api=A.load(text),symbol=api.getLanguage('graphql').contains.find(m=>m.scope==='symbol');
  api.registerLanguage('fold',()=>({case_insensitive:true,unicodeRegex:true,contains:[symbol]}));api[debug?'debugMode':'safeMode']();
  results[variant]=[];
  for(const language of order){
   const output=A.record(api,'aK:',language,ignoreIllegals),matcher=api.getLanguage(language).matcher;
   assert(api.getLanguage(language).contains.includes(symbol),'Must share the actual compiled child, not a copy');
   results[variant].push({language,output,childFlags:symbol.beginRe.flags,selectorFlags:matcher.getMatcher(0).matcherRe.flags});
  }
 }
 assert.deepEqual(results.original,results.core);
 const equal=JSON.stringify(results.candidate)===JSON.stringify(results.core);
 try{assert.deepEqual(results.candidate,results.core);}catch(e){failures.push({order,debug,ignoreIllegals,message:e.message});}
 rows.push({order,debug,ignoreIllegals,equal,results});
}
console.log(JSON.stringify({runtime:process.versions,rows,failures},null,2));assert.equal(failures.length,0,`${failures.length}/${rows.length} shared flags mismatches`);
