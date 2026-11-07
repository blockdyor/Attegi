const assert=require('node:assert/strict');
const auth=require('./highlight-owned-auth.cjs');
const {restoreSwiftComment:restoreComment}=require('./fixtures/highlight-swift-reconstruction.cjs');
const baseline=restoreComment(auth.source);
let comparisons=0;
function compare(name,run){assert.deepEqual(run(auth.load()),run(auth.load(baseline)),name);comparisons++;}
const codes=['~   I can\'t foo-bar abc END',"~ abc foo can't END",'~ a is to END','~TODO: x END','~   TODO: FIXME: END','~  xTODO: END','~    !','~ '+String.fromCharCode(0xdc00)+' TODO: END','~ 😀 TODO: END','~   Kaa ſaa foo END','~  XY END','~'];
const flags=['','i','u','iu'];
function grammar(api,flag,comment,extensions){api.registerLanguage('p',()=>({case_insensitive:flag.includes('i'),unicodeRegex:flag.includes('u'),contains:[comment,{begin:/(X)(Y)/,scope:'title'}],compilerExtensions:extensions}));}
function shape(rule){return {keys:Object.keys(rule).sort((a,b)=>a<b?-1:a>b?1:0),begin:String(rule.begin),end:String(rule.end),beginRe:rule.beginRe&&String(rule.beginRe),endRe:rule.endRe&&String(rule.endRe),excludeBegin:rule.excludeBegin,returnBegin:rule.returnBegin,scope:rule.scope,relevance:rule.relevance,hooks:['on:begin','on:end'].filter(k=>rule[k])};}
for(const flag of flags)compare('raw/compiled exact shape '+flag,api=>{
 const c=api.COMMENT('~','END'),raw=Array.from(c.contains,shape);grammar(api,flag,c);api.highlight('',{language:'p'});
 return {raw,compiled:Array.from(c.contains,shape)};
});
// Compare full native arrays, retaining actual undefined slots and unrelated tails.
for(const flag of flags)compare('native complete arrays '+flag,api=>{
 const c=api.COMMENT('~','END',{contains:[{begin:/(X)(Y)/,scope:'title'}]});grammar(api,flag,c);api.highlight('',{language:'p'});
 return ['   I can\'t foo-bar abc '," abc foo can't ",' a is to ','TODO:','  TODO:','XY','   no','   Kaa ſaa foo '].map(input=>{
  c.matcher.considerAll();c.matcher.lastIndex=0;const m=c.matcher.exec(input);
  return m&&{captures:Array.from(m),index:m.index,input:m.input,type:m.type,position:m.position,rule:c.contains.indexOf(m.rule)};
 });
});
for(const late of [false,true])for(const kind of ['observe','reject','mutate','mutate-index','data'])for(const flag of flags)for(const ignore of [false,true])compare(`hooks ${late}/${kind}/${flag}/${ignore}`,api=>{
 const c=api.COMMENT('~','END',{illegal:/!/}),events=[];grammar(api,flag,c);
 if(late)api.highlight('~ a is to END',{language:'p'});
 for(let i=0;i<2;i++){
  const hooks={};
  for(const event of ['begin','end'])hooks['on:'+event]=(m,r)=>{
   events.push({event,i,values:Array.from(m),index:m.index,input:m.input,type:m.type,position:m.position});
   if(kind==='reject'&&(event==='begin'||m.index%2))r.ignoreMatch();
   if(kind==='mutate')m[0]=event==='begin'?'Q':'E';
   if(kind==='mutate-index')m.index=Math.max(0,m.index-1);
   if(kind==='data'){r.data.calls=(r.data.calls||0)+1;events.push({calls:r.data.calls});}
  };
  if(late)Object.assign(c.contains[i],hooks);else c.contains[i]=api.inherit(c.contains[i],hooks);
 }
 const results=codes.map(code=>auth.record(api,code,'p',ignore));return {events,results};
});
for(const kind of ['accessor','prototype','contains','begin','callback','extension','inherit','frozen','variants'])for(const flag of flags)compare('guard '+kind+'/'+flag,api=>{
 const c=api.COMMENT('~','END'),events=[];
 for(let i=0;i<2;i++){
  let r=c.contains[i];
  if(kind==='accessor'){const value=r.begin;Object.defineProperty(r,'begin',{enumerable:true,configurable:true,get:()=>value});}
  if(kind==='prototype')Object.setPrototypeOf(r,{extra:true});
  if(kind==='contains')r.contains=[{begin:/x/,scope:'title'}];
  if(kind==='begin')r.begin=i===0?'[ ]*(?=TODO:)':'[ ]+(abc)';
  if(kind==='callback')r['on:begin']=m=>events.push([m[0],m[1],m[2],m[3],m.index]);
  if(kind==='inherit')r=api.inherit(r);
  if(kind==='frozen')Object.freeze(r);
  if(kind==='variants')r=api.inherit(r,{variants:[{}]});
  c.contains[i]=r;
 }
 grammar(api,flag,c,kind==='extension'?[(m,p)=>{if(p===c)m.contains=[{begin:/x/,scope:'title'}];}]:undefined);
 const out=codes.map(code=>auth.record(api,code,'p',false));
 return {out,events};
});
for(const first of flags)for(const second of flags)compare('same compiled children '+first+'->'+second,api=>{
 const c=api.COMMENT('~','END'),out=[];
 for(const flag of [first,second]){
  const id='p'+out.length;api.registerLanguage(id,()=>({case_insensitive:flag.includes('i'),unicodeRegex:flag.includes('u'),contains:[c]}));
  out.push(auth.record(api,'~  Kaa ſaa foo TODO: END',id,false));
  // A compiled child's old beginRe flags must not become the authority for a later parent.
  for(const r of c.contains)r.beginRe=RegExp(r.beginRe.source,'m');
 }
 return out;
});
for(const end of [/ /,/(?= )/,/$/,/(?=END)/,/END/])for(const flag of flags)for(const ignore of [false,true])compare('native suffix/EOF '+end+'/'+flag+'/'+ignore,api=>{
 const c=api.COMMENT('~',end,{illegal:/!/});grammar(api,flag,c);
 return codes.map(code=>auth.record(api,code,'p',ignore));
});
for(const option of ['returnBegin','excludeBegin','excludeEnd','returnEnd','endsParent','skip'])compare('parent option '+option,api=>{
 const c=api.COMMENT('~','END',{[option]:true});grammar(api,'',c);return codes.map(code=>auth.record(api,code,'p',false));
});
compare('autodetect top two and nonempty chunks',api=>{
 return codes.map(code=>{const r=api.highlightAuto(code,['javascript','java','graphql']);return {first:auth.json({value:r.value,relevance:r.relevance,language:r.language,tree:r._emitter.rootNode}),second:r.secondBest&&auth.json({value:r.secondBest.value,relevance:r.secondBest.relevance,language:r.secondBest.language})};});
});

for(const kind of ['default','inherit','frozen','accessor','prototype','contains','callback','begin']){
 const api=auth.load(),c=api.COMMENT('~','END');
 for(let i=0;i<2;i++){
  let r=c.contains[i];
  if(kind==='inherit')r=api.inherit(r);
  if(kind==='frozen')Object.freeze(r);
  if(kind==='accessor'){const value=r.begin;Object.defineProperty(r,'begin',{enumerable:true,get:()=>value});}
  if(kind==='prototype')Object.setPrototypeOf(r,{});
  if(kind==='contains')r.contains=[];
  if(kind==='callback')r['on:begin']=()=>{};
  if(kind==='begin')r.begin='x';
  c.contains[i]=r;
 }
 grammar(api,'',c);api.highlight('',{language:'p'});
 const selected=c.matcher.getMatcher(0).matcherRe.source,eligible=['default','inherit','frozen'].includes(kind);
 assert.equal(selected.includes('[ ]()()()'),eligible,kind+' phrase');
 assert.equal(selected.includes('(?:[ ]|(?=(?:TODO|FIXME|NOTE|BUG|OPTIMIZE|HACK|XXX):))()'),eligible,kind+' doctag');
}
for(const flag of flags)compare('cached actual flags after root mutation '+flag,api=>{
 const c=api.COMMENT('~','END');grammar(api,flag,c);const code='~  Kaa ſaa foo TODO: END';
 const first=auth.record(api,code,'p',false),r=api.getLanguage('p');
 r.case_insensitive=!r.case_insensitive;r.unicodeRegex=!r.unicodeRegex;
 return {first,second:auth.record(api,code,'p',false)};
});
for(const flag of flags)compare('sibling scope offsets after false COMMENT selectors '+flag,api=>{
 const events=[],c=api.COMMENT('~','END');
 c.contains.push({begin:[/([ ]+)/,/(XY)/],beginScope:{1:'title',2:'string'},'on:begin':m=>events.push({values:Array.from(m),index:m.index,input:m.input,position:m.position})});
 grammar(api,flag,c);api.highlight('',{language:'p'});
 const m=c.matcher;m.considerAll();m.lastIndex=0;const hit=m.exec('   XY');
 return {hit:hit&&{values:Array.from(hit),index:hit.index,input:hit.input,position:hit.position},result:auth.record(api,'~   XY END','p',false),events};
});
console.log(JSON.stringify({runtime:process.version,bun:process.versions.bun||null,comparisons,baseline:auth.hash(baseline),candidate:auth.hash(auth.source)}));
