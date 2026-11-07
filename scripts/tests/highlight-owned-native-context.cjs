// Native selector flags, including extension changes and resumed sticky suffixes, are authoritative.
const assert=require('node:assert/strict');
const A=require('./highlight-owned-auth.cjs');
const rows=[],failures=[];
function check(name,run){const out={};for(const [kind,text]of Object.entries({original:A.original,core:A.base,candidate:A.source}))out[kind]=run(A.load(text),kind);assert.deepEqual(out.original,out.core,name+' original/core');try{assert.deepEqual(out.candidate,out.core,name);}catch(e){failures.push({name,message:e.message});}rows.push({name,out});}
for(const [from,to]of [['','iu'],['iu',''],['i','iu'],['iu','i']])for(const debug of [false,true])for(const ignore of [false,true])check(`extension-root:${from}->${to}:${debug}:${ignore}`,api=>{
 const symbol=api.getLanguage('graphql').contains.find(m=>m.scope==='symbol');
 api.registerLanguage('p',()=>({case_insensitive:from.includes('i'),unicodeRegex:from.includes('u'),contains:[symbol,{scope:'title',begin:/(fallback)/}],illegal:/!/,compilerExtensions:[(m,parent)=>{if(!parent){m.case_insensitive=to.includes('i');m.unicodeRegex=to.includes('u');}}]}));api[debug?'debugMode':'safeMode']();
 const result=['aK: aa: bb:','plain😀 aK: fallback','plain\udc00 aK:','abc','abc!'].map(code=>A.record(api,code,'p',ignore));
 const root=api.getLanguage('p'),nativeFlags=root.matcher.getMatcher(0).matcherRe.flags;
 // A later mutable-language edit cannot change already cached native selection.
 root.case_insensitive=!root.case_insensitive;root.unicodeRegex=!root.unicodeRegex;
 const cached=A.record(api,'aK: aa:','p',ignore);
 return {result,cached,nativeFlags};
});
for(const flags of ['', 'i','u','iu'])for(const debug of [false,true])for(const ignore of [false,true])check(`resumed:${flags}:${debug}:${ignore}`,api=>{
 const symbol=api.getLanguage('graphql').contains.find(m=>m.scope==='symbol');
 api.registerLanguage('p',()=>({case_insensitive:flags.includes('i'),unicodeRegex:flags.includes('u'),contains:[{scope:'first',begin:/a/, 'on:begin':(m,r)=>r.ignoreMatch()},symbol,{scope:'title',begin:/(fallback)/}],illegal:/!/}));api[debug?'debugMode':'safeMode']();
 return ['aa: bb:','abc😀 fallback','aa:\udc00 bb:','abc','abc!'].map(code=>A.record(api,code,'p',ignore));
});
for(const order of [['p','fold'],['fold','p']])for(const debug of [false,true])for(const ignore of [false,true])check(`shared-reentry:${order}:${debug}:${ignore}`,api=>{
 const symbol=api.getLanguage('graphql').contains.find(m=>m.scope==='symbol'),nested=[];
 api.registerLanguage('fold',()=>({case_insensitive:true,unicodeRegex:true,contains:[symbol]}));
 api.registerLanguage('p',()=>({contains:[{begin:/~/,'on:begin':()=>{const r=api.highlight('aK:',{language:'fold',ignoreIllegals:ignore});nested.push({value:r.value,tree:r._emitter.rootNode,error:r.errorRaised?.message});}},symbol]}));
 api[debug?'debugMode':'safeMode']();
 for(const language of order)api.highlight('',{language});
 const output=A.record(api,'~ aK: aa:','p',ignore);return A.json({output,nested});
});
for(const flags of ['', 'i','u','iu'])check('empty-remaining:'+flags,api=>{
 const symbol=api.getLanguage('graphql').contains.find(m=>m.scope==='symbol');api.registerLanguage('p',()=>({case_insensitive:flags.includes('i'),unicodeRegex:flags.includes('u'),contains:[symbol]}));
 const output=A.record(api,'plain😀\udc00','p',true),matcher=api.getLanguage('p').matcher;
 const empty=matcher.getMatcher(matcher.rules.length);empty.lastIndex=0;assert.equal(empty.exec('plain😀\udc00'),null);
 return output;
});
for(const via of ['default','frozen','frozen-inherit'])check('data-properties:'+via,api=>{
 let symbol=api.getLanguage('graphql').contains.find(m=>m.scope==='symbol');
 if(via==='frozen-inherit')symbol=api.inherit(symbol);if(via!=='default')Object.freeze(symbol);
 api.registerLanguage('p',()=>({contains:[symbol]}));const output=A.record(api,'abc: aa:','p',true);
 // Frozen data shapes retain private eligibility (not a public grammar mutation).
 return {output,publicBegin:api.getLanguage('p').contains[0].beginRe.source};
});
// Only candidate's private selector spelling differs for trusted DATA shapes.
// Check the eligibility independently instead of normalizing semantic output.
for(const freeze of [false,true]){const api=A.load(),symbol=api.getLanguage('graphql').contains.find(m=>m.scope==='symbol');if(freeze)Object.freeze(symbol);api.registerLanguage('p',()=>({contains:[symbol]}));api.highlight('abc:',{language:'p'});assert(!api.getLanguage('p').matcher.getMatcher(0).matcherRe.source.includes('[_0-9A-Za-z]*'));}
console.log(JSON.stringify({runtime:process.versions,sourceHash:A.hash(A.source),rows,failures},null,2));assert.equal(failures.length,0,`${failures.length}/${rows.length} native-context mismatches`);
