const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const {source,core:base,original,hash}=require('./fixtures/highlight-metadata-oracle.cjs');
const root=path.resolve(__dirname,'../..');
const scripts=new Map;
const json=x=>JSON.parse(JSON.stringify(x));function load(text=source){let script=scripts.get(text);if(!script){script=new vm.Script(text);scripts.set(text,script);}const c=vm.createContext({console});script.runInContext(c);return c.hljs;}
function snapshot(r,chunks){const top=[];for(let t=r._top;t;t=t.parent)top.push({scope:t.scope,skip:t.skip,excludeEnd:t.excludeEnd,returnEnd:t.returnEnd,returnBegin:t.returnBegin,data:t.data});return json({keys:Object.keys(r).sort((a,b)=>a<b?-1:a>b?1:0),value:r.value,relevance:r.relevance,language:r.language,illegal:r.illegal,illegalBy:r._illegalBy&&{index:r._illegalBy.index,context:r._illegalBy.context,message:r._illegalBy.message,resultSoFar:r._illegalBy.resultSoFar},error:r.errorRaised?.message,tree:r._emitter.rootNode,top,chunks});}
function record(api,code,language,ignoreIllegals){const E=api.highlight('',{language})._emitter.constructor,chunks=[];class Recording extends E{addText(t){if(t)chunks.push(t);return super.addText(t);}}api.configure({__emitter:Recording});try{return snapshot(api.highlight(code,{language,ignoreIllegals}),chunks);}finally{api.configure({__emitter:E});}}
let comparisons=0;function compare(a,b,codes,language){for(const debug of [false,true]){for(const api of [a,b])api[debug?'debugMode':'safeMode']();for(const ignore of [false,true])for(const code of codes){assert.deepEqual(record(a,code,language,ignore),record(b,code,language,ignore),language+':'+JSON.stringify(code)+':'+ignore+':'+debug);comparisons++;}}}

module.exports={getComparisons:()=>comparisons,load,record,compare,source,base,original,hash,root,json};
