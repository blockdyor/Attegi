const fs=require('node:fs'),assert=require('node:assert/strict');
const auth=require('./highlight-owned-auth.cjs'),{hash}=auth;
const {restoreSwiftComment:restoreComment}=require('./fixtures/highlight-swift-reconstruction.cjs');
const candidate=auth.source,baseline=restoreComment(candidate);
assert.equal(hash(baseline),'4e9ee4915ccba94a5a696080397bb395a4cb4f7ebf9118869826c784a61faf6a');
let comparisons=0,matched=0;const details=[];
function compare(name,run){const a=run(auth.load(baseline)),b=run(auth.load(candidate));assert.deepEqual(b,a,name);comparisons++;details.push(name)}
for(const flags of ['','i','u','iu']){
compare('real capture slots '+flags,api=>{
api.registerLanguage('p',h=>({case_insensitive:flags.includes('i'),unicodeRegex:flags.includes('u'),contains:[h.COMMENT('~','END',{contains:[{begin:/(X)(Y)/,scope:'title'}]})]}));api.highlight('',{language:'p'});
const comment=api.getLanguage('p').contains[0],out=[];
for(const code of ['   I can\'t foo-bar ',' TODO:','TODO:','xTODO:','   Kaa ſaa foo ','XY','   no','  a is to ']){
const matcher=comment.matcher;matcher.considerAll();matcher.lastIndex=0;const m=matcher.exec(code);
// Only actual selected captures, not unrelated unmatched suffixes or ordinal metadata.
const captures=m?.rule===comment.contains[1]?1:m?.rule===comment.contains[2]?3:m?.rule===comment.contains[0]?2:0;
out.push(auth.json(m&&{index:m.index,type:m.type,values:Array.from(m).slice(0,captures+1)}));if(m)matched++;
}return out;
});
}
for(const order of [['i','iu'],['iu','i']])compare('compiled shared both orders '+order,api=>{
const c=api.COMMENT('~','END');for(const flag of order)api.registerLanguage(flag,()=>({case_insensitive:true,unicodeRegex:flag==='iu',contains:[c]}));
const out=[];for(const flag of order)out.push(auth.record(api,'~  Kaa ſaa foo TODO: END',flag,false));return out;
});
for(const debug of [false,true])for(const ignore of [false,true])compare('diagnostic parser unchanged '+debug+ignore,api=>{
api[debug?'debugMode':'safeMode']();api.registerLanguage('p',h=>({contains:[h.COMMENT('~',/END$/,{illegal:/!/})]}));const r=auth.record(api,'~    !','p',ignore);if(!ignore)assert.equal(r.illegalBy.index,1);return r;
});
for(const from of ['','iu'])for(const to of ['','iu'])compare('extension root flags '+from+'->'+to,api=>{
api.registerLanguage('p',h=>({case_insensitive:from.includes('i'),unicodeRegex:from.includes('u'),contains:[h.COMMENT('~','END')],compilerExtensions:[(m,parent)=>{if(!parent){m.case_insensitive=to.includes('i');m.unicodeRegex=to.includes('u')}}]}));return auth.record(api,'~   Kaa ſaa foo TODO: END','p',false);
});
compare('root modes and getLanguage observer',api=>{
const c=api.getLanguage('javascript').contains.find(m=>m.scope==='comment'&&m.begin==='//')||api.C_LINE_COMMENT_MODE;
const events=[];api.registerLanguage('p',h=>({contains:[h.inherit(c.contains[1],{'on:begin':m=>events.push([m[0],m[1],m[2],m[3],m.index])})]}));const r=auth.record(api,' plain   I can\'t foo-bar ','p',false);
api.registerLanguage('root',h=>h.inherit(h.COMMENT('~','END').contains[0],{name:'root'}));return {r,events,root:auth.record(api,'TODO:','root',false)};
});
compare('reentry evicts COMMENT cache',api=>{
const comment=api.COMMENT('~','END');api.registerLanguage('inner',()=>({case_insensitive:true,unicodeRegex:true,contains:[comment]}));
const nested=[];api.registerLanguage('outer',h=>({contains:[{begin:/@/,'on:begin':()=>nested.push(auth.record(api,'~ Kaa ſaa foo TODO: END','inner',false))},comment]}));
return {outer:auth.record(api,'~ a is to END @ ~   a is to END','outer',false),nested};
});
console.log(JSON.stringify({runtime:process.version,bun:process.versions.bun||null,source:hash(auth.source),counterfactual:hash(candidate),comparisons,matched,details},null,2));
