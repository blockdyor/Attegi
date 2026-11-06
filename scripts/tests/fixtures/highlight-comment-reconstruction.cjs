// Exact, scoped COMMENT inverse authenticates the direct base before VM execution.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const rows=require('./highlight-comment-reviewed.json');
const hash=text=>createHash('sha256').update(text).digest('hex');
assert.equal(rows.length,7);
function restoreComment(text){
 for(const row of rows){
  assert.equal(hash(row.candidate),row.candidateSha256);
  assert.equal(text.split(row.candidate).length,2,row.reviewed);
  text=text.replace(row.candidate,row.reviewed);
 }
 assert.equal(hash(text),'4e9ee4915ccba94a5a696080397bb395a4cb4f7ebf9118869826c784a61faf6a');
 return text;
}
module.exports={restoreComment};
