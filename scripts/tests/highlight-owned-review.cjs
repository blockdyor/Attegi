// Independently authored c2 review witnesses; a synthetic public mode or unflagged index fails these.
(()=>{
const assert=require('node:assert/strict');
const {load,record,original,base,source,hash}=require('./highlight-owned-auth.cjs');
const rows=[];
function check(name,run){const results={};for(const [kind,text]of Object.entries({original,core:base,candidate:source}))results[kind]=run(load(text));assert.deepEqual(results.original,results.core,name+' original/core');let equal=true;try{assert.deepEqual(results.core,results.candidate);}catch{equal=false;}rows.push({name,equal,...results});}
check('raw-shape',api=>{const s=api.getLanguage('graphql').contains.find(x=>x.scope==='symbol');return {keys:Object.keys(s).sort((a,b)=>a<b?-1:a>b?1:0),begin:typeof s.begin==='string'?s.begin:s.begin.source,end:typeof s.end==='string'?s.end:s.end?.source,returnBegin:s.returnBegin,hooks:['on:begin','on:end'].filter(k=>s[k])};});
for(const order of [['i','iu'],['iu','i']])check('shared-input-fresh-inherit:'+order.join(','),api=>{const s=api.getLanguage('graphql').contains.find(x=>x.scope==='symbol');const modes=order.map(()=>api.inherit(s));for(let i=0;i<order.length;i++)api.registerLanguage('p'+i,()=>({case_insensitive:order[i].includes('i'),unicodeRegex:order[i].includes('u'),contains:[modes[i]]}));return order.map((f,i)=>({flags:f,record:record(api,'aK:','p'+i,true)}));});
for(const debug of [false,true])check('owned-mode-at-language-root:'+debug,api=>{const s=api.getLanguage('graphql').contains.find(x=>x.scope==='symbol');api.registerLanguage('p',()=>api.inherit(s,{name:'p'}));if(debug)api.debugMode();try{const r=api.highlight('abc:',{language:'p'});return {value:r.value,error:r.errorRaised?.message};}catch(e){return {throw:e.message};}});
check('inherited-rejecting-callback',api=>{const calls=[],s=api.getLanguage('graphql').contains.find(x=>x.scope==='symbol');api.registerLanguage('p',()=>({contains:[api.inherit(s,{'on:begin':(m,r)=>{calls.push({text:m[0],index:m.index});r.ignoreMatch();}}),{scope:'title',begin:/[a-z]+/}]}));return {output:record(api,'plain abc:','p',true),calls};});
check('inherited-contained-mode',api=>{const s=api.getLanguage('graphql').contains.find(x=>x.scope==='symbol');api.registerLanguage('p',()=>({contains:[api.inherit(s,{contains:[{scope:'title',begin:/a/}]})]}));return record(api,'abc:','p',true);});
check('inherited-comment-phrase-callback',api=>{const calls=[],s=api.COMMENT('~',/END$/).contains[1];api.registerLanguage('p',()=>({contains:[api.inherit(s,{'on:begin':m=>calls.push({text:m[0],index:m.index})})]}));return {output:record(api,' plain','p',true),calls};});
console.log(JSON.stringify({runtime:process.versions,hashes:{original:hash(original),core:hash(base),candidate:hash(source)},rows},null,2));

assert(rows.every(x=>x.equal),JSON.stringify(rows.filter(x=>!x.equal).map(x=>x.name||[x.flags,x.code]||[x.hook,x.code])));

})();
(()=>{
// Read-only original/core/candidate flag-equivalence probe.
const assert=require('node:assert/strict');
const {load,record,original,base,source,hash}=require('./highlight-owned-auth.cjs');
const cases=['K:','\u212a:','\u017f:','a\u212a:','x\u017f:','\u212a :','\u212aBEGIN;'];
const rows=[];
for(const flags of ['', 'i','u','iu'])for(const code of cases){
 const results={};
 for(const [variant,text]of Object.entries({original,core:base,candidate:source})){
  const api=load(text),symbol=api.getLanguage('graphql').contains.find(x=>x.scope==='symbol');
  assert(symbol);api.registerLanguage('p',()=>({case_insensitive:flags.includes('i'),unicodeRegex:flags.includes('u'),contains:[symbol],illegal:/[;<']|BEGIN/}));
  results[variant]=record(api,code,'p',true);
 }
 assert.deepEqual(results.original,results.core,'Original/core unexpectedly differ');
 let equal=true;try{assert.deepEqual(results.core,results.candidate);}catch{equal=false;}
 rows.push({flags,code,equal,core:results.core.value,candidate:results.candidate.value,coreError:results.core.error,candidateError:results.candidate.error});
}
console.log(JSON.stringify({runtime:process.versions,hashes:{original:hash(original),core:hash(base),candidate:hash(source)},rows,mismatches:rows.filter(x=>!x.equal)},null,2));

assert(rows.every(x=>x.equal),JSON.stringify(rows.filter(x=>!x.equal).map(x=>x.name||[x.flags,x.code]||[x.hook,x.code])));

})();
(()=>{
const assert=require('node:assert/strict');
const {load,record,original,base,source,hash}=require('./highlight-owned-auth.cjs');
const rows=[];
for(const hook of ['on:begin','on:end'])for(const code of ['plain','abc:']){
 const results={};
 for(const [variant,text]of Object.entries({original,core:base,candidate:source})){
  const api=load(text),calls=[],symbol=api.getLanguage('graphql').contains.find(x=>x.scope==='symbol');
  const derived=api.inherit(symbol,{[hook]:(m)=>calls.push({text:m[0],index:m.index})});
  api.registerLanguage('p',()=>({contains:[derived]}));
  results[variant]={output:record(api,code,'p',true),calls};
 }
 assert.deepEqual(results.original,results.core);
 let equal=true;try{assert.deepEqual(results.core,results.candidate);}catch{equal=false;}
 rows.push({hook,code,equal,core:{value:results.core.output.value,calls:results.core.calls},candidate:{value:results.candidate.output.value,calls:results.candidate.calls}});
}
console.log(JSON.stringify({runtime:process.versions,hashes:{original:hash(original),core:hash(base),candidate:hash(source)},rows},null,2));

assert(rows.every(x=>x.equal),JSON.stringify(rows.filter(x=>!x.equal).map(x=>x.name||[x.flags,x.code]||[x.hook,x.code])));

})();
