const fs=require('node:fs'),assert=require('node:assert/strict');
const auth=require('./highlight-owned-auth.cjs'),{hash}=auth;
const {restoreSwiftComment:restoreComment}=require('./fixtures/highlight-swift-reconstruction.cjs');
const candidate=auth.source,baseline=restoreComment(candidate);
assert.equal(hash(baseline),'4e9ee4915ccba94a5a696080397bb395a4cb4f7ebf9118869826c784a61faf6a');
function setup(api,variant,events){
api.registerLanguage('probe',h=>{
let comment=h.COMMENT('~',/END$/,{contains:variant==='nested'?[h.COMMENT('~',/END$/)]:[]});
if(variant.startsWith('hook'))for(let i=0;i<2;i++){
comment.contains[i]=h.inherit(comment.contains[i],{'on:begin':(m,r)=>{events.push(['begin',i,Array.from(m).slice(0,i===0?2:4),m.index]);if(variant==='hook-reject')r.ignoreMatch();if(variant==='hook-mutate')m[0]='Q';},'on:end':m=>events.push(['end',i,m[0],m.index])});
}
if(variant==='end-space')comment.end=/ /;
if(variant==='parent-hook')comment['on:end']=(m,r)=>{events.push(['parent',m[0],m.index]);if(m.index%2)r.ignoreMatch()};
return {case_insensitive:variant.includes('i'),unicodeRegex:variant.includes('u'),contains:[comment,{begin:/(X)(Y)/,scope:'title','on:begin':m=>events.push(['sibling',Array.from(m).slice(0,3),m.index])}],illegal:/!/};
});
}
const rows=[];
const codes=['~ plain END','~ a is to END','~   I can\'t foo-bar abc END','~TODO: x END','~   TODO: x END','~  xTODO: x END','~   !END','~   zzzzzzz!','~  FIXME: TODO:BUG: END','~ \ud83d\ude00 TODO: END','~ Kaa ſaa foo END','~ XX XY END','~  a is to END\nXY!','~ ~ a is to END END'];
let count=0;
for(const variant of ['plain','i','u','iu','nested','end-space','parent-hook','hook-observe','hook-reject','hook-mutate']){
const a=auth.load(baseline),b=auth.load(candidate),ea=[],eb=[];setup(a,variant,ea);setup(b,variant,eb);
for(const debug of [false,true])for(const ignore of [false,true])for(const code of codes){
a[debug?'debugMode':'safeMode']();b[debug?'debugMode':'safeMode']();ea.length=eb.length=0;
assert.deepEqual(auth.record(b,code,'probe',ignore),auth.record(a,code,'probe',ignore),variant+JSON.stringify(code));assert.deepEqual(eb,ea);count++;
}rows.push({variant,comparisons:codes.length*4});
}
// Public wrappers exercise compiled selectors; preserve the original capture-slot counts.
const api=auth.load(candidate),raw=api.COMMENT('~','END');
const captureCounts=raw.contains.map(r=>RegExp(r.begin+'|').exec('').length-1);
assert.deepEqual(Array.from(captureCounts),[1,3]);
for(const code of ['//'+ ' '.repeat(128)+'z'.repeat(128)+'!','//'+ ' '.repeat(128)+'!','//'+ ' '.repeat(128)+'TODO:']){
for(const language of ['javascript','java','graphql'])assert.deepEqual(auth.record(auth.load(candidate),code,language,false),auth.record(auth.load(baseline),code,language,false));
}
const receipt={runtime:process.version,bun:process.versions.bun||null,source:hash(auth.source),fixture:hash(fs.readFileSync(__dirname+'/highlight-vendor-baseline.json')),original:hash(auth.original),counterfactual:hash(candidate),comparisons:count+9,captureCounts,rows};
console.log(JSON.stringify(receipt,null,2));
