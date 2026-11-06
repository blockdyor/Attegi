// Exercise complete public API calls in V8's native regexp interpreter.
const fs=require('node:fs'),vm=require('node:vm'),v8=require('node:v8'),assert=require('node:assert/strict');
const source=fs.readFileSync(new URL('../../../src/js/libs/highlight.pack.js','file://'+__filename),'utf8');
process.stdout._handle?.setBlocking(true);
const ctx=vm.createContext({console});vm.runInContext(source,ctx);
ctx.hljs.highlight('/** warmup */',{language:'java'});
let active;
ctx.trace=(regex,input,exec)=>{
 if(!active)return exec.call(regex,input);
 process.stdout.write('NATIVE_BEGIN '+JSON.stringify({...active,source:regex.source,flags:regex.flags,from:regex.lastIndex})+'\n');
 v8.setFlagsFromString('--trace-regexp-bytecodes');const result=exec.call(regex,input);v8.setFlagsFromString('--no-trace-regexp-bytecodes');
 process.stdout.write('NATIVE_END '+JSON.stringify({index:result?.index,text:result?.[0]})+'\n');return result;
};
vm.runInContext('const exec=RegExp.prototype.exec;RegExp.prototype.exec=function(input){return trace(this,input,exec)}',ctx);
for(const n of [16,32,64])for(const kind of ['reject','accept']){
 active={n,kind};const r=ctx.hljs.highlight('/** '+'z'.repeat(n)+(kind==='accept'?'@tag':'!')+' */',{language:'java',ignoreIllegals:false});active=null;
 assert.equal(r.errorRaised,undefined);assert.equal(r.illegal,false);
}
