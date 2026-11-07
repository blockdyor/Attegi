// Standalone complete-API measurement; no production hooks or proxy work counts.
const {load,source,core,hash} = require('./highlight-metadata-oracle.cjs');
const assert=require('node:assert/strict'), fs=require('node:fs'), v8=require('node:v8');
process.stdout._handle?.setBlocking(true);
const [variant='candidate',family='graphql-fail',size='16',policy='false',flagText='i']=process.argv.slice(2);
const n=Number(size),ignoreIllegals=policy==='true',trace=process.env.OWNED_TRACE==='1';
assert(Number.isSafeInteger(n)&&n>0);if(trace){assert.equal(process.versions.bun,undefined,'Native bytecode evidence requires Node/V8');console.log('NATIVE_RUNTIME '+JSON.stringify({node:process.version,v8:process.versions.v8}));}assert(['candidate','core'].includes(variant));assert(['','i','u','iu'].includes(flagText));
const cases={

 'graphql-fail':()=> 'a'.repeat(n)+' '.repeat(n)+'; later: 1',
 'graphql-success':()=> 'a'.repeat(n)+' '.repeat(n)+': 1',
 'graphql-later':()=> 'a'.repeat(n)+' '.repeat(n)+'! valid: 1',
 'graphql-labels':()=> ('name ').repeat(n)+'last: 1'
};
assert(Object.hasOwn(cases,family));const code=cases[family](),text=variant==='candidate'?source:core,api=load(text);
let language='p';
if(family.startsWith('graphql')){
 const graph=api.getLanguage('graphql');
 // The stock punctuation regexp has legacy identity escapes invalid under /u.
 if(flagText.includes('u'))api.registerLanguage('p',()=>({case_insensitive:flagText.includes('i'),unicodeRegex:true,contains:[graph.contains.find(x=>x.scope==='symbol')],illegal:/[;<']|BEGIN/}));
 else {language='graphql';Object.assign(graph,{case_insensitive:flagText.includes('i')});}
}

api.debugMode();api.highlight('warmup',{language,ignoreIllegals:true});
const native=api.getLanguage(language).matcher.getMatcher(0).matcherRe, C=native.constructor,exec=C.prototype.exec;
let calls=0,matchedChars=0;const sources=new Map();
C.prototype.exec=function(input){
 const source=this.source,flags=this.flags,key=source+' /'+flags;
 const row=sources.get(key)||{source,flags,calls:0,matchedChars:0};sources.set(key,row);row.calls++;calls++;
 if(trace)fs.writeSync(1,'\n@@START '+JSON.stringify({source,flags,start:this.lastIndex})+'\n');
 let m;if(trace)v8.setFlagsFromString('--trace-regexp-bytecodes');
 try{m=exec.call(this,input);}finally{if(trace)v8.setFlagsFromString('--no-trace-regexp-bytecodes');}
 row.matchedChars+=m?.[0].length||0;matchedChars+=m?.[0].length||0;
 if(trace)fs.writeSync(1,'\n@@END '+JSON.stringify({index:m?.index,text:m?.[0]})+'\n');return m;
};
const start=process.hrtime.bigint();let result;
try{result=api.highlight(code,{language,ignoreIllegals});}finally{C.prototype.exec=exec;}
const elapsedNs=String(process.hrtime.bigint()-start);assert.equal(result.errorRaised,undefined);
const top=[];for(let t=result._top;t;t=t.parent)top.push({scope:t.scope,data:t.data});
fs.writeSync(1,'\n@@DONE '+JSON.stringify({variant,family,n,ignoreIllegals,flagText,language,measurementScope:family.startsWith('graphql')&&flagText.includes('u')?'symbol-mode wrapper':'complete grammar',runtime:process.versions,sourceHash:hash(text),calls,matchedChars,elapsedNs,timingIncludesTracing:trace,helperSteps:null,bySource:[...sources.values()],output:{value:result.value,relevance:result.relevance,illegal:result.illegal,illegalBy:result._illegalBy&&{index:result._illegalBy.index,context:result._illegalBy.context,message:result._illegalBy.message,resultSoFar:result._illegalBy.resultSoFar},error:result.errorRaised?.message,tree:result._emitter.rootNode,top}})+'\n');
