// Exact inverse for the combined release-candidate source; no behavioral whitelist.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const packet=require('./highlight-batch-reviewed.json');
const hash=text=>createHash('sha256').update(text).digest('hex');
const prior='6a01ae5d2933ebf048d2a0ad42a1990833ba3e562f7869fb59f7280b6f325b66';
function restoreBatch(text){
 const actual=hash(text);if(actual===packet.baseSha256||actual===prior)return text;
 assert.equal(actual,packet.candidateSha256,'Unreviewed combined source');
 for(const row of packet.rows){
  assert.equal(hash(row.base),row.baseSha256);assert.equal(hash(row.candidate),row.candidateSha256);
  assert.equal(text.split(row.candidate).length,2,row.scope+' unique inverse');text=text.replace(row.candidate,row.base);
 }
 assert.equal(hash(text),packet.baseSha256);return text;
}
module.exports={restoreBatch};
