// Scoped Swift-only inverse; authenticate accepted92 before the unchanged historical inverses.
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const rows=require('./highlight-swift-reviewed.json');
const hash=x=>createHash('sha256').update(x).digest('hex');
const {restoreIni}=require('./highlight-ini-reconstruction.cjs');
function restoreSwift(text){
 text=restoreIni(text);
 assert.equal(rows.length,4);
 for(const row of rows){assert.equal(hash(row.candidate),row.candidateSha256);assert.equal(text.split(row.candidate).length,2);text=text.replace(row.candidate,row.base);}
 assert.equal(hash(text),'b147654ccb6da19bf7281c9a69a147140c6feffc344a02992ee9731e28a2364f');return text;
}
const {restoreComment}=require('./highlight-comment-reconstruction.cjs');
const restoreSwiftComment=text=>restoreComment(restoreSwift(text));
module.exports={restoreSwift,restoreSwiftComment};
