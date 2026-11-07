const assert=require('node:assert/strict'),A=require('./highlight-owned-auth.cjs');
const a=A.load();a.highlight('a=1',{language:'ini'});
const g=a.getLanguage('ini'),t=g.contains.at(-1),selected=g.matcher.getMatcher(0).matcherRe;
assert.equal(selected.flags,'gim');
assert.equal(selected.source.includes(t.beginRe.source),false,'original INI 2g begin must leave the selecting matcher');
assert(selected.source.includes('[A-Za-z0-9_"\'-]()()()'));
assert.equal(g.matcher.hasOwnedFilter,true);
console.log(JSON.stringify({pass:true,source:A.hash(A.source),selector:selected.source,flags:selected.flags}));
