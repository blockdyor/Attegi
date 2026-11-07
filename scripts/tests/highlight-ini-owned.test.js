import {test,expect} from 'bun:test';
import {spawnSync} from 'node:child_process';
for(const script of ['selection','probe','contracts'])test(`INI 2g private selector ${script}`,()=>{
 const r=spawnSync(process.execPath,[new URL(`highlight-ini-${script}.cjs`,import.meta.url).pathname],{encoding:'utf8',timeout:90000});
 expect(r.error,r.stderr).toBeUndefined();expect(r.status,r.stdout+r.stderr).toBe(0);
 const receipt=JSON.parse(r.stdout);console.log(JSON.stringify({script,pass:true,groups:receipt.groups,pairs:receipt.comparisonPairs}));
},95000);
test('INI 2g fresh decoded V8 cache references and negative control',()=>{
 const r=spawnSync('node',['--allow-natives-syntax',new URL('highlight-ini-contracts.cjs',import.meta.url).pathname],{encoding:'utf8',timeout:90000});
 expect(r.error,r.stderr).toBeUndefined();expect(r.status,r.stdout+r.stderr).toBe(0);
 const receipt=JSON.parse(r.stdout);expect(receipt.rows.find(r=>r.name==='fresh-equal-reference').negativeControlFailures).toBe(4);
},95000);
