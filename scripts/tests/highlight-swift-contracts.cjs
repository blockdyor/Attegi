const assert=require('node:assert/strict'),A=require('./highlight-owned-auth.cjs');
const {restoreSwift}=require('./fixtures/highlight-swift-reconstruction.cjs');
const base=restoreSwift(A.source),sources=[base,A.source];let groups=0;
function modes(a){const s=a.getLanguage('swift');return [s.contains.at(-1).contains[1],s.contains[2].contains.find(m=>m.end?.source==='\\)').contains[0]];}
const plain=A.json,sort=(a,b)=>a<b?-1:a>b?1:0;
function check(name,run,ss=sources){const expected=run(A.load(ss[0]));for(const s of ss.slice(1))assert.deepEqual(run(A.load(s)),expected,name);groups++;}
const witness='func f( '+'a'.repeat(26)+"'bad",codes=[witness];
for(const name of ['x','_','a2','é','Δ','中文','a\u0301','\u200Bx','`class`','$0','2x'])for(const gap of ['',' ','\t','\r\n','\u00a0','\u2028'])codes.push(`func f(${name}${gap}: Int, label local: Int) {}`);
codes.push('( x: 1, longLabel   : 2)','func f(a b c: Int, bad ! x: String)','func f( '+'a'.repeat(64)+' '.repeat(64)+': Int)','( '+'a'.repeat(64)+' '.repeat(64)+': 1)','func f( '+'a'.repeat(64)+' b'+' '.repeat(64)+': Int)','func f( '+'a'.repeat(64)+' '.repeat(64)+'!','( '+'a'.repeat(64)+' '.repeat(64)+'!','func f( '+'a'.repeat(64)+' a'+' '.repeat(64)+'!');
assert.equal(codes.length,75);
codes.push('func f(😀: Int, '+String.fromCharCode(0xdc00)+': Int) {}','func f<T>(`class` local: T) -> T {}','(a! q : 1, later : 2)','func f(Kaa ſaa: Int) {}');
for(const debug of [false,true])for(const ignore of [false,true])check('default '+debug+ignore,a=>{a[debug?'debugMode':'safeMode']();const out=codes.map(c=>A.record(a,c,'swift',ignore));if(!ignore){assert.equal(out[0].illegalBy.index,7);assert.equal(out[0].illegalBy.context,witness);}return out;},[A.original,...sources]);
function shape(m){return {keys:Object.keys(m).sort(sort),match:String(m.match),begin:String(m.begin),end:String(m.end),beginRe:m.beginRe&&String(m.beginRe),endRe:m.endRe&&String(m.endRe)};}
for(const flag of ['m','mi','mu','miu'])for(const idx of [0,1])for(const order of [[flag,'m'],['m',flag]])check('isolated shared flags '+idx+order,a=>{
 const target=modes(a)[idx],out=[];
 for(const [j,f]of order.entries()){const id='p'+j;a.registerLanguage(id,()=>({case_insensitive:f.includes('i'),unicodeRegex:f.includes('u'),contains:[target,{begin:/(X)(Y)\2/,scope:'title'}]}));
 for(const code of ['label local: XY Y','Kaa ſaa:','label\n :',String.fromCharCode(0xdc00)+' :','😀label:'])out.push(A.record(a,code,id,false));}
 return out;
});
for(const flag of ['mu','miu'])check('stock invalid punctuation '+flag,a=>{const s=a.getLanguage('swift');s.unicodeRegex=true;s.case_insensitive=flag.includes('i');try{a.highlight('',{language:'swift'});assert.fail('expected stock Swift compile error');}catch(e){assert.equal(e.name,'SyntaxError');assert(e.message.includes('}')&&e.message.includes('regular expression'));return e.message;}});
for(const idx of [0,1])for(const kind of ['none','getter','getter-changing','setter','prototype','frozen','inherit','variants','extension','extension-accessor','extension-flags','root'])check('normalization '+idx+kind,a=>{
 let target=modes(a)[idx],reads=0,sets=0;const key=idx===0?'match':'begin',value=target[key];
 if(kind.startsWith('getter'))Object.defineProperty(target,key,{enumerable:true,configurable:true,get(){reads++;return kind==='getter-changing'&&reads===1?/Q/:value;}});
 if(kind==='setter'&&idx===0)Object.defineProperty(target,'begin',{enumerable:true,configurable:true,get(){return undefined;},set(v){sets++;Object.defineProperty(this,'begin',{value:/Z/,writable:true,enumerable:true,configurable:true});}});
 if(kind==='prototype')Object.setPrototypeOf(target,{custom:true});if(kind==='frozen')Object.freeze(target);
 if(kind==='inherit')target=a.inherit(target);if(kind==='variants')target=a.inherit(target,{variants:[{}]});
 const raw=shape(target);a.registerLanguage('p',()=>kind==='root'?target:{contains:[target],compilerExtensions:[(m,p)=>{if(!p&&kind==='extension-flags'){m.case_insensitive=true;m.unicodeRegex=true;}if(m===target&&kind==='extension')m.begin=/Z/;if(m===target&&kind==='extension-accessor'){const v=m.begin;Object.defineProperty(m,'begin',{configurable:true,enumerable:true,get:()=>v});}}]});
 const out=['label local:','Q: Z:','Kaa:','bad ! later:'].map(c=>A.record(a,c,'p',false));return {raw,out,reads,sets,compiled:shape(a.getLanguage('p').contains?.[0]||a.getLanguage('p'))};
});
for(const late of [false,true])for(const kind of ['observe','reject','mutate','data','error','reentry'])for(const idx of [0,1])for(const debug of [false,true])check('callbacks '+late+kind+idx+debug,a=>{
 a[debug?'debugMode':'safeMode']();const target=modes(a)[idx],events=[];a.registerLanguage('p',()=>({contains:[target,{begin:/(X)(Y)\2/,scope:'title'}],illegal:/!/}));
 if(late)a.highlight('',{language:'p'});let entered=false;
 for(const stage of ['begin','end'])target['on:'+stage]=(m,r)=>{events.push([stage,Array.from(m),m.index,m.input]);if(kind==='reject')r.ignoreMatch();if(kind==='mutate')m[0]=stage==='begin'?'q':':';if(kind==='data'){r.data.n=(r.data.n||0)+1;events.push(r.data.n);assert.equal(r.data,m.rule.data);}if(kind==='error')throw Error('Swift callback control');if(kind==='reentry'&&!entered){entered=true;a.highlight('inner local:',{language:'p'});}};
 const out=[];for(const code of ['label local: XYY','bad ! later:','label:'])try{out.push(A.record(a,code,'p',false));}catch(e){out.push({thrown:e.message});}return {out,events};
});
for(const idx of [0,1])for(const order of [[0,1,2],[2,1,0],[1,2,0]])for(const late of [false,true])check('mixed owned '+idx+order+late,a=>{
 const swift=modes(a)[idx],comment=a.COMMENT('~','END').contains[1],gql=a.getLanguage('graphql').contains.find(m=>m.scope==='symbol'),events=[],rules=[swift,comment,gql];
 a.registerLanguage('p',()=>({contains:[...order.map(i=>rules[i]),{begin:/(X)(Y)\2/,scope:'title'}],illegal:/!/}));if(late)a.highlight('',{language:'p'});
 for(const [i,r]of rules.entries())r['on:begin']=(m,res)=>{events.push([i,Array.from(m),m.index,m.input]);if(m.index%2)res.ignoreMatch();};
 const out=['aaa ! label: XYY',' plain foo bar label:','label local:','TODO: x','x:','a ! XYY'].map(c=>A.record(a,c,'p',false));return {out,events};
});
for(const idx of [0,1])check('native arrays '+idx,a=>{const t=modes(a)[idx];a.registerLanguage('p',()=>({contains:[t,{begin:/(X)(Y)\2/,scope:'title'}]}));a.highlight('',{language:'p'});const m=a.getLanguage('p').matcher;return ['label:','label local:','XYY','!'].map(input=>{m.considerAll();m.lastIndex=0;const x=m.exec(input);return x&&{values:Array.from(x),index:x.index,input:x.input,type:x.type};});});
check('API and aliases',a=>({languages:Array.from(a.listLanguages()),aliases:Array.from(a.listLanguages()).flatMap(l=>(a.getLanguage(l).aliases||[]).map(x=>[x,a.getLanguage(x)===a.getLanguage(l)])),auto:(()=>{const r=a.highlightAuto('func f(label local: Int) {}',['swift','javascript','graphql']);return {value:r.value,relevance:r.relevance,language:r.language,secondBest:r.secondBest&&{value:r.secondBest.value,relevance:r.secondBest.relevance,language:r.secondBest.language}};})()}));
for(const debug of [false,true])check('scoped emitter reentry and fresh decoded strings '+debug,a=>{
 a[debug?'debugMode':'safeMode']();const E=a.highlight('',{language:'swift'})._emitter.constructor;let entered=false;class R extends E{addText(t){if(t&&!entered){entered=true;a.highlight('func inner(other local: Int) {}',{language:'swift'});}return super.addText(t);}}a.configure({__emitter:R});const r=a.highlight(witness,{language:'swift',ignoreIllegals:false});a.configure({__emitter:E});assert(entered);const out=[A.snapshot?A.snapshot(r):plain({value:r.value,index:r._illegalBy?.index,context:r._illegalBy?.context,tree:r._emitter.rootNode})];for(let i=0;i<3;i++)out.push(A.record(a,Buffer.from(witness).toString(),'swift',false));return out;
},[A.original,...sources]);
const registrations=text=>{const matches=Array.from(text.matchAll(/grmr_([a-z0-9_]+):/g));assert.equal(matches.length,36);return new Map(matches.map((m,i)=>[m[1],text.slice(m.index,matches[i+1]?.index||text.length)]));};
// Compare Swift's historical delta only; APIs above still exercise the full candidate.
const {restoreIni}=require('./fixtures/highlight-ini-reconstruction.cjs');
const oldRegistrations=registrations(base),newRegistrations=registrations(restoreIni(A.source));let unchanged=0;
for(const [name,body]of oldRegistrations)if(name!=='swift'){assert.equal(newRegistrations.get(name),body,name);unchanged++;}assert.equal(unchanged,35);
const metadata=A.load();assert.equal(metadata.listLanguages().length,36);assert.equal(metadata.listLanguages().reduce((n,l)=>n+(metadata.getLanguage(l).aliases||[]).length,0),71);
console.log(JSON.stringify({groups,unchangedOtherLanguages:unchanged,defaultCorpus:codes.length,source:A.hash(A.source),base:A.hash(base),original:A.hash(A.original),runtime:process.versions.bun||process.version,pass:true}));
