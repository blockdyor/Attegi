import {test,expect} from 'bun:test';
import {spawnSync} from 'node:child_process';
import {source,core,load} from './fixtures/highlight-metadata-oracle.cjs';

test('private GraphQL selection preserves public raw and compiled mode shape',()=>{
 const apis=[load(),load(core)];
 function shape(s){return {keys:Object.keys(s).sort((a,b)=>a<b?-1:a>b?1:0),begin:s.begin,end:s.end?.source,returnBegin:s.returnBegin,hooks:['on:begin','on:end'].filter(k=>s[k]),beginRe:s.beginRe?.source};}
 expect(shape(apis[0].getLanguage('graphql').contains.find(x=>x.scope==='symbol'))).toEqual(shape(apis[1].getLanguage('graphql').contains.find(x=>x.scope==='symbol')));
 for(const api of apis)api.highlight('fullName: 1',{language:'graphql'});
 expect(shape(apis[0].getLanguage('graphql').contains.find(x=>x.scope==='symbol'))).toEqual(shape(apis[1].getLanguage('graphql').contains.find(x=>x.scope==='symbol')));
 const matcher=apis[0].getLanguage('graphql').matcher.getMatcher(0).matcherRe.source;
 expect(matcher).not.toContain('[_0-9A-Za-z]*');expect(matcher).toContain('[_A-Za-z]');
});
for(const script of ['callbacks','history','review','customization','probe','shared-flags','accessor','native-context'])for(const runtime of ['node','bun'])test(`GraphQL owned filter ${runtime} ${script}: public state and errors remain exact`,()=>{
 const r=spawnSync(runtime,[new URL(`highlight-owned-${script}.cjs`,import.meta.url).pathname],{encoding:'utf8',timeout:30000});
 expect(r.error,r.stderr).toBeUndefined();expect(r.status,r.stdout+r.stderr).toBe(0);
 if(script!=='review')console.log(r.stdout.trim());
},30000);
test('GraphQL filtering retains exact COMMENT1/GraphQL0/Swift7 diagnostics and context',()=>{
 for(const debug of [false,true])for(const text of [source,core]){
  const api=load(text);if(debug)api.debugMode();api.registerLanguage('p',h=>({contains:[h.COMMENT('~',/END$/,{illegal:/!/})]}));
  const cases=[['p','~    !',1,'!','comment'],['graphql','zBEGIN',0,'BEGIN','<unnamed>'],['graphql','zzBEGIN',0,'BEGIN','<unnamed>'],['swift',"func f( "+'a'.repeat(26)+"'bad",7,"'",'<unnamed>']];
  for(const [language,code,index,lexeme,mode] of cases){const r=api.highlight(code,{language,ignoreIllegals:false});
   expect(r.illegal).toBe(true);expect({index:r._illegalBy.index,context:r._illegalBy.context,message:r._illegalBy.message,resultSoFar:r._illegalBy.resultSoFar})
    .toEqual({index,context:code,message:`Illegal lexeme "${lexeme}" for mode "${mode}"`,resultSoFar:''});
  }
 }
});
