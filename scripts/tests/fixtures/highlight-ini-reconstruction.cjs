// INI 2g-only inverse: no historical objects, whitelists or other grammar deltas.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const rows=require('./highlight-ini-reviewed.json');
const hash=x=>createHash('sha256').update(x).digest('hex');
const accepted='6a01ae5d2933ebf048d2a0ad42a1990833ba3e562f7869fb59f7280b6f325b66';
const {restoreBatch}=require('./highlight-batch-reconstruction.cjs');
function restoreIni(text){
 text=restoreBatch(text);
 if(hash(text)===accepted)return text;
 assert.equal(hash(text),'60e706e40ae4481d5514627692b9321bf42dc9b69af862c45175a60183499123');
 assert.equal(rows.length,3);
 for(const row of rows){assert.equal(hash(row.candidate),row.candidateSha256);assert.equal(text.split(row.candidate).length,2);text=text.replace(row.candidate,row.base);}
 assert.equal(hash(text),accepted);return text;
}
module.exports={restoreIni};
