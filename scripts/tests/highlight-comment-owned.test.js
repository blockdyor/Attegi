import {test,expect} from 'bun:test';
import {spawnSync} from 'node:child_process';
import {load} from './highlight-owned-auth.cjs';

test('COMMENT combined selectors do not repeat the whole whitespace grammar',()=>{
 const api=load();api.registerLanguage('p',h=>({contains:[h.COMMENT('~','END')]}));api.highlight('',{language:'p'});
 const comment=api.getLanguage('p').contains[0],re=comment.matcher.getMatcher(0).matcherRe.source;
 expect(re).toContain('[ ]()()()');
 expect(re).toContain('(?:[ ]|(?=(?:TODO|FIXME|NOTE|BUG|OPTIMIZE|HACK|XXX):))()');
 expect(re).not.toContain('[ ]+');expect(re).not.toContain('[ ]*');
});
for(const script of ['probe','contracts','guards'])test(`COMMENT native selection ${script}`,()=>{
 const timeout=script==='guards'?90000:30000;
 const r=spawnSync(process.execPath,[new URL(`highlight-comment-${script}.cjs`,import.meta.url).pathname],{encoding:'utf8',timeout});
 expect(r.error,r.stderr).toBeUndefined();expect(r.status,r.stdout+r.stderr).toBe(0);console.log(r.stdout.trim());
},95000);
test('COMMENT cache rebinds equal-valued fresh decoded input references',()=>{
 const r=spawnSync('node',['--allow-natives-syntax',new URL('highlight-comment-cache.cjs',import.meta.url).pathname],{encoding:'utf8',timeout:30000});
 expect(r.error,r.stderr).toBeUndefined();expect(r.status,r.stdout+r.stderr).toBe(0);console.log(r.stdout.trim());
},35000);
