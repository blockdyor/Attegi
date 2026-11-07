// Optional actual V8 bytecodes: node --regexp-interpret-all ... variant family n trace.
const {A,fs,assert,hash,binding,source,load,json}=require('./highlight-ini-probe.cjs');
const {input,families}=require('./fixtures/highlight-ini-cases.cjs'),v8=require('node:v8');
assert.equal(process.versions.bun,undefined,'native instruction probe requires real Node/V8');
const [variant='counterfactual',family='quoted-success',size='16',trace]=process.argv.slice(2),n=Number(size);
assert(['baseline','counterfactual'].includes(variant));assert(families.includes(family));assert([16,32].includes(n));
process.stdout._handle?.setBlocking(true);
const code=input(family,n),api=load(variant);api.debugMode();api.highlight('warmup',{language:'ini'});
const g=api.getLanguage('ini'),native=g.matcher.getMatcher(0).matcherRe,begin=g.contains.at(-1).beginRe.source;
assert.equal(native.flags,'gim');assert.equal(native.source.includes(begin),variant==='baseline');
const C=native.constructor,exec=C.prototype.exec,bySource=new Map;let calls=0,recoveries=0;
C.prototype.exec=function(value){const key=this.source+' /'+this.flags;bySource.set(key,(bySource.get(key)||0)+1);calls++;if(this.source===begin&&this.sticky)recoveries++;
 if(trace)fs.writeSync(1,'\n@@START '+JSON.stringify({source:this.source,flags:this.flags,start:this.lastIndex})+'\n');
 if(trace)v8.setFlagsFromString('--trace-regexp-bytecodes');
 try{return exec.call(this,value);}finally{if(trace){v8.setFlagsFromString('--no-trace-regexp-bytecodes');fs.writeSync(1,'\n@@END\n');}}
};
let r;try{r=api.highlight(code,{language:'ini',ignoreIllegals:true});}finally{C.prototype.exec=exec;}
assert.equal(r.errorRaised,undefined);if(variant==='counterfactual')assert.equal(recoveries,family==='rich-negative'?0:1);
const output=json({value:r.value,relevance:r.relevance,illegal:r.illegal,illegalBy:r._illegalBy&&{index:r._illegalBy.index,context:r._illegalBy.context,message:r._illegalBy.message,resultSoFar:r._illegalBy.resultSoFar},tree:r._emitter.rootNode});
fs.writeSync(1,'\n@@DONE '+JSON.stringify({variant,family,n,runtime:process.versions,sourceHash:hash(source[variant]),inputHash:hash(code),binding,calls,recoveries,bySource:[...bySource],selector:native.source,flags:native.flags,output,probe:hash(fs.readFileSync(__filename))})+'\n');
