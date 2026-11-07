// Synthetic public grammar or a guard that ignores customization breaks these comparisons.
const assert=require('node:assert/strict');
const {load,record,source,base,original,hash,json}=require('./highlight-owned-auth.cjs');
let comparisons=0;
const variants=['inherit','frozen','variants','contains','keywords','skip','excludeBegin','returnBegin','begin','end','endsParent','starts','beforeMatch','extension-contains','extension-hook','nonenumerable-hook','prototype-hook'];
for(const prior of [false,true])for(const kind of variants){
 function execute(text){
  const api=load(text),events=[];const symbol=api.getLanguage('graphql').contains.find(x=>x.scope==='symbol');
  if(prior)api.highlight('warmup:',{language:'graphql'});
  let rule=api.inherit(symbol);
  const observe=(m,r)=>{events.push([m[0],m.index,m.input]);r.data.count=(r.data.count||0)+1;};
  if(kind==='frozen')Object.freeze(rule);
  if(kind==='variants')rule=api.inherit(symbol,{variants:[{}, {begin:/custom/}]});
  if(kind==='contains')rule.contains=[{scope:'title',begin:/a/}];
  if(kind==='keywords')rule.keywords='abc';
  if(kind==='skip')rule.skip=true;
  if(kind==='excludeBegin')rule.excludeBegin=true;
  if(kind==='returnBegin'){rule.returnBegin=true;rule.end=/c/;if(prior)rule.isCompiled=false;}
  if(kind==='begin')rule.begin=/custom/;
  if(kind==='end')rule.end=/!/;
  if(kind==='endsParent')rule.endsParent=true;
  if(kind==='starts')rule.starts={scope:'title',end:/!/};
  if(kind==='beforeMatch'&&!prior)rule.beforeMatch=/ /;
  if(kind==='nonenumerable-hook')Object.defineProperty(rule,'on:begin',{value:observe});
  if(kind==='prototype-hook')Object.setPrototypeOf(rule,{'on:begin':observe});
  api.registerLanguage('p',()=>({contains:[{begin:/~/,end:/END/,contains:[rule]}],illegal:/;/,
   compilerExtensions:[m=>{if(m.scope==='symbol'){
    if(kind==='extension-contains')m.contains=[{scope:'title',begin:/a/}];
    if(kind==='extension-hook')m['on:begin']=observe;
   }}]}));
  const outputs=[];for(const debug of [false,true])for(const ignore of [false,true]){
   api[debug?'debugMode':'safeMode']();
   for(const code of ['~ plain abc: next:! END','~ custom! END','~a; END','~','~abc:'])try{outputs.push(record(api,code,'p',ignore));}catch(e){outputs.push({throw:e.message});}
  }
  return json({outputs,events});
 }
 assert.deepEqual(execute(source),execute(base),JSON.stringify({prior,kind}));comparisons++;
}
for(const prior of [false,true])for(const hook of ['on:begin','on:end'])for(const action of ['observe','reject','lexeme','index','throw','reentry']){
 function execute(text){
  const api=load(text),events=[],symbol=api.getLanguage('graphql').contains.find(x=>x.scope==='symbol');
  if(prior)api.highlight('warmup:',{language:'graphql'});
  let nested=false,shared;
  api.registerLanguage('p',()=>({illegal:/;/,contains:[api.inherit(symbol,{[hook]:(m,r)=>{
   if(shared)assert.equal(shared,r.data);else shared=r.data;
   events.push([m[0],m.index,m.input]);r.data.count=(r.data.count||0)+1;
   if(action==='reject'&&(hook==='on:begin'||r.data.count===1))r.ignoreMatch();
   if(action==='lexeme')m[0]='mutated';
   if(action==='index')m.index++;
   if(action==='throw')throw Error('derived callback exception');
   if(action==='reentry'&&!nested){nested=true;try{api.highlight('nested:',{language:'graphql'});}finally{nested=false;}}
  }})]}));
  const outputs=[];for(const debug of [false,true])for(const ignore of [false,true]){
   api[debug?'debugMode':'safeMode']();
   for(const code of ['plain','abc: next:','abc; next:','abc:'])try{outputs.push(record(api,code,'p',ignore));}catch(e){outputs.push({throw:e.message});}
  }
  return json({outputs,events,data:shared});
 }
 assert.deepEqual(execute(source),execute(base),JSON.stringify({prior,hook,action}));comparisons++;
}
// After compilation the normal public object is still original-shaped; direct added
// callbacks receive the full materialized begin, not the private selection primitive.
for(const hook of ['on:begin','on:end']){
 function execute(text){const api=load(text),events=[];api.highlight('warmup:',{language:'graphql'});const s=api.getLanguage('graphql').contains.find(x=>x.scope==='symbol');s[hook]=m=>events.push([m[0],m.index]);return {output:record(api,'plain fullName: 1','graphql',true),events,begin:s.begin,end:s.end?.source};}
 assert.deepEqual(json(execute(source)),json(execute(base)));comparisons++;
}
// One factory, distinct uncompiled raw copies, same input in both flag orders.
for(const order of [['','i','u','iu'],['iu','u','i',''],['i','iu','i','iu'],['iu','i','iu','i']]){
 function execute(text){const api=load(text),raw=api.getLanguage('graphql').contains.find(x=>x.scope==='symbol'),rules=order.map(()=>api.inherit(raw));for(let i=0;i<order.length;i++)api.registerLanguage('p'+i,()=>({case_insensitive:order[i].includes('i'),unicodeRegex:order[i].includes('u'),contains:[rules[i]],illegal:/;/}));return ['aK:','ſ:','fullName:',(' '+'aK:').slice(1),'aK:','😀aK:'].flatMap(code=>order.map((f,i)=>record(api,code,'p'+i,false)));}
 const expected=execute(base);assert.deepEqual(execute(original),expected);assert.deepEqual(execute(source),expected);comparisons++;
}
// Genuine false symbol starts must preserve sibling/end/illegal/EOF selection.
for(const unicodeRegex of [false,true])for(const which of ['sibling','end','illegal','empty']){
 const apis=[load(source),load(base)];for(const api of apis)api.registerLanguage('p',h=>{const symbol=h.inherit(h.getLanguage('graphql').contains.find(x=>x.scope==='symbol'));const children=[symbol];if(which==='sibling')children.push({scope:'title',begin:/a/,end:/;/});return {unicodeRegex,illegal:/!/,contains:which==='end'?[{begin:/~/,end:/a/,contains:children}]:children};});
 require('./highlight-owned-auth.cjs').compare(...apis,which==='end'?['~a','~😀a','~']:['','a','😀a','aa!;','fullName:'],'p');comparisons++;
}
// Emitting a full begin may reenter the shared index; no end-hook state is borrowed.
for(const trigger of ['text','close','sublanguage']){
 function execute(text){const api=load(text);api.registerLanguage('outer',()=>({contains:[{begin:/</,end:/>/,subLanguage:'graphql'}]}));const E=api.highlight('',{language:'graphql'})._emitter.constructor;let nested=false,count=0;const events=[];
 class Reentrant extends E {run(){if(!nested){nested=true;try{api.highlight('inner: 1',{language:'graphql'});count++;}finally{nested=false;}}}addText(t){if(t&&!nested){events.push(t);if(trigger==='text')this.run();}return super.addText(t);}closeNode(){if(trigger==='close')this.run();return super.closeNode();}__addSublanguage(...args){if(trigger==='sublanguage')this.run();return super.__addSublanguage(...args);}}
 api.configure({__emitter:Reentrant});const result=api.highlight(trigger==='sublanguage'?'<fullName: 42 nextName: 1>':'fullName: 42 nextName: 1',{language:trigger==='sublanguage'?'outer':'graphql',ignoreIllegals:false});assert(count>0);return json({value:result.value,relevance:result.relevance,tree:result._emitter.rootNode,error:result.errorRaised?.message,events});}
 assert.deepEqual(execute(source),execute(base),trigger);comparisons++;
}
console.log(JSON.stringify({status:'public customization, current flags and reentry exact',comparisons,source:hash(source),runtime:process.versions.bun||process.version}));
