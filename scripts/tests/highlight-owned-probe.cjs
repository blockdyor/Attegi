const assert=require('node:assert/strict');
const {load,compare,source,base,hash}=require('./highlight-owned-auth.cjs');
const graph=['','BEGIN','zBEGIN','zzBEGIN','BEGINBEGIN','BEGIN:','zBEGIN:','0foo:',"name; later: 42","name' later: 42",'<name:>','μname: 🙂x:','a_b09: x','query Q($id: ID!) { user(id: $id) { true: false } }','# field: BEGIN\nname: "BEGIN: quoted"','@foo field: 1','... on Type { alias: field }'];
for(const sep of [' ','\t','\n','\r','\r\n','\u2028','\u2029','\u00a0','\ufeff'])graph.push('name'+sep+': next: 42','bad'+sep+'! valid: 1');
for(const n of [16,32,64,512])graph.push('x'.repeat(n)+' '.repeat(n)+'!','BEGIN'.repeat(n)+' '.repeat(n)+'!');
compare(load(),load(base),graph,'graphql');
assert.deepEqual(Object.keys(load()).sort((a,b)=>a<b?-1:a>b?1:0),Object.keys(load(base)).sort((a,b)=>a<b?-1:a>b?1:0));
console.log(JSON.stringify({status:'stock GraphQL corpus exact',source:hash(source),comparisons:require('./highlight-owned-auth.cjs').getComparisons(),runtime:process.versions}));
