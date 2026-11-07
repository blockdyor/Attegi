import {test,expect} from 'bun:test';
import {spawnSync} from 'node:child_process';
for(const script of ['selection','contracts'])test(`Swift private selector ${script}`,()=>{
 const r=spawnSync(process.execPath,[new URL(`highlight-swift-${script}.cjs`,import.meta.url).pathname],{encoding:'utf8',timeout:90000});
 expect(r.error,r.stderr).toBeUndefined();expect(r.status,r.stdout+r.stderr).toBe(0);console.log(r.stdout.trim());
},95000);
