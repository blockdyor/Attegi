import {test,expect} from 'bun:test';
import {spawnSync} from 'node:child_process';
test('combined highlighter repairs retain public cache, current-flag errors and mixed-language contracts',()=>{
 const result=spawnSync(process.execPath,[new URL('highlight-batch-contracts.cjs',import.meta.url).pathname],{encoding:'utf8',timeout:90000});
 expect(result.error,result.stderr).toBeUndefined();expect(result.status,result.stdout+result.stderr).toBe(0);
 const receipt=JSON.parse(result.stdout);expect(receipt.status).toBe('PASS');expect(receipt.pairs).toBe(96);console.log(JSON.stringify(receipt));
},95000);
