// Eager owned continuation must not change ordinary ignores, even on V8's low-surrogate retry.
const assert=require('node:assert/strict');
const {load,source,base,original,json,record}=require('./highlight-owned-auth.cjs');
let comparisons=0;
function run(text,{debug,unicodeRegex,owned,after,zero,code}) {
 const api=load(text),calls=[];let count=0;
 api.registerLanguage('p',h=>({unicodeRegex,contains:[
  ...(after?[h.inherit(h.getLanguage('graphql').contains.find(x=>x.scope==='symbol'))]:[]),
  {begin:zero?/(?=😀)/:/😀/,'on:begin':(m,r)=>{
   calls.push(json({text:m[0],index:m.index,input:m.input,captures:Array.from(m).slice(1).filter(x=>x!==undefined),keys:Object.keys(r).sort((a,b)=>a<b?-1:a>b?1:0),data:r.data}));
   r.data.calls=(r.data.calls||0)+1;
   if(++count===3)throw Error('trial callback budget reached');
   r.ignoreMatch();
  }},
  ...(!after&&owned?[h.inherit(h.getLanguage('graphql').contains.find(x=>x.scope==='symbol'))]:[])
 ]}));
 if(debug)api.debugMode();let result,thrown;
 try{result=record(api,code,'p',false);}catch(e){thrown=e.message;}
 return json({calls,result,thrown});
}
for(const debug of [false,true])for(const unicodeRegex of [false,true])for(const owned of [false,true])for(const zero of [false,true])for(const after of [false,true]) {
 const opts={debug,unicodeRegex,owned,zero,after,code:after?'a 😀':'😀'};
 const old=run(base,opts),strict=run(original,opts),now=run(source,opts);
 if(zero) assert.deepEqual(old.calls,strict.calls,JSON.stringify(opts));
 else assert.deepEqual(old,strict,JSON.stringify(opts));
 assert.deepEqual(now,old,JSON.stringify(opts));comparisons+=2;
}
// A real owned rejection must retain same-position ordinary callbacks and never leak
// its local Unicode cursor into the next public matcher invocation.
for(const unicodeRegex of [false,true])for(const same of [false,true])for(const debug of [false,true]) {
 const calls=[];function execute(text){const api=load(text);api.registerLanguage('p',h=>({unicodeRegex,contains:[h.inherit(h.getLanguage('graphql').contains.find(x=>x.scope==='symbol')),{begin:same?/a/:/😀/,'on:begin':(m,r)=>{calls.push([text===source?'candidate':'base',m[0],m.index]);r.ignoreMatch();}},{scope:'title',begin:same?/a/:/😀/,end:/;/}]}));if(debug)api.debugMode();return record(api,'a😀; a😀;','p',false);}
 assert.deepEqual(execute(source),execute(base));
 assert.deepEqual(calls.filter(x=>x[0]==='candidate').map(x=>x.slice(1)),calls.filter(x=>x[0]==='base').map(x=>x.slice(1)));comparisons++;
}
console.log(JSON.stringify({status:'mixed ordinary callbacks exact',comparisons,runtime:process.versions.bun?'bun':'node'}));
