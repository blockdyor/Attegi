const assert=require('node:assert/strict'),A=require('./highlight-owned-auth.cjs');
const {restoreBatch}=require('./fixtures/highlight-batch-reconstruction.cjs');
const packet=require('./fixtures/highlight-batch-reviewed.json');
const base=restoreBatch(A.source);assert.equal(A.hash(base),packet.baseSha256);assert.equal(A.hash(A.source),packet.candidateSha256);
let pairs=0;
function cacheResult(text,attack,debug){
 const api=A.load(text);api[debug?'debugMode':'safeMode']();let reads=0;const scope=api.inherit({1:'title'});
 if(attack==='cycle')scope.unused=scope;
 if(attack==='proxy')scope.unused=new Proxy(Object.create(null),{getPrototypeOf(){throw Error('unused prototype queried');}});
 let wrapper=api.inherit({scope:'title',beginScope:scope,variants:[{begin:/a/}]});
 if(attack.startsWith('cache-')){
  const cache=[{scope:'title',begin:/a/}];
  if(attack==='cache-map')Object.defineProperty(cache,'map',{get(){throw Error('public cache map accessed');}});
  if(attack==='cache-species')Object.defineProperty(cache,'constructor',{get(){throw Error('public cache constructor accessed');}});
  if(attack==='cache-index')Object.defineProperty(cache,'0',{get(){reads++;return {scope:'title',begin:/a/};}});
  if(attack==='cache-not-spreadable')cache[Symbol.isConcatSpreadable]=false;
  wrapper={cachedVariants:cache};
 }
 api.registerLanguage('batch-cache',()=>({contains:[wrapper]}));
 try{const r=api.highlight('a',{language:'batch-cache'});return {value:r.value,error:r.errorRaised?.message||null,reads};}catch(e){return {thrown:e.message,reads};}
}
for(const attack of['cycle','proxy','cache-map','cache-species','cache-index','cache-not-spreadable'])for(const debug of[false,true]){assert.deepEqual(cacheResult(A.source,attack,debug),cacheResult(base,attack,debug),attack+'/'+debug);pairs++;}
function sharedResult(text,kind,flags,code,debug){
 const api=A.load(text);api.highlight('',{language:'java'});
 const mode=api.getLanguage('java').contains.find(r=>r.beginScope&&Object.values(r.beginScope).includes(kind==='variable'?'variable':'title.function')&&Object.values(r.beginScope).includes('type'));
 assert(mode,'actual precompiled Java '+kind);api.registerLanguage('batch-shared',()=>({unicodeRegex:flags.includes('u'),case_insensitive:flags.includes('i'),contains:[mode]}));
 api[debug?'debugMode':'safeMode']();
 try{const r=api.highlight(code,{language:'batch-shared',ignoreIllegals:false});return {value:r.value,error:r.errorRaised&&{name:r.errorRaised.name,message:r.errorRaised.message},illegal:r.illegal};}catch(e){return {thrown:{name:e.name,message:e.message}};}
}
for(const kind of['variable','method'])for(const flags of['m','mi','mu','miu'])for(const code of['',kind==='variable'?'Type value = 1;':'Type method() {}'])for(const debug of[false,true]){assert.deepEqual(sharedResult(A.source,kind,flags,code,debug),sharedResult(base,kind,flags,code,debug),kind+'/'+flags+'/'+debug+'/'+code);pairs++;}
const before=A.load(base),after=A.load(A.source);
const cases=[['csharp','string x = """raw\nbody"""; int n=1;'],['csharp','var s = """"a\"\"\"inside"""";'],['java','class A { int f(int x) { return x; } int y=1; }'],['java','Type value = 1; Type method() {}'],['php','#[Foo Aa\\Bb Good] new Abc(); Aa::CONST;'],['php','#[Foo Aa$ Good] new FooBar(); \\Name\\Good::class;'],['ini','x=+12_3\ny=-42_0'],['ini','a . "b" = [1,2]\nz=#bad'],['yaml','a b : c: 1\n"quoted key": value\n\'single\': true'],['yaml','a b no colon\nkey: [1, 2]'],['swift','func f(label local: Int) { "bad'],['graphql','query Q { user(id: 1) { name } }'],['javascript','/** TODO: a is so to\n * note */ function f(a) { return a; }']];
for(const debug of[false,true]){for(const api of[before,after])api[debug?'debugMode':'safeMode']();for(const [language,code]of cases)for(const policy of[false,true]){assert.deepEqual(A.record(after,code,language,policy),A.record(before,code,language,policy),language+'/'+debug+'/'+policy);pairs++;}}
assert.equal(after.listLanguages().length,36);assert.equal(after.listLanguages().reduce((n,l)=>n+(after.getLanguage(l).aliases||[]).length,0),71);
console.log(JSON.stringify({status:'PASS',pairs,source:A.hash(A.source),base:A.hash(base),original:A.hash(A.original),runtime:process.versions}));
