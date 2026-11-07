// Pure, scoped inverse for historical authentication only; never a behavioral oracle.
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const rows = require('../highlight-owned-reviewed.json');
const hash = text => createHash('sha256').update(text).digest('hex');
assert.equal(rows.length, 3);
function restoreOwned(text) {
    for (const row of rows) {
        const lo = text.indexOf(row.start), hi = text.indexOf(row.end, lo);
        assert(lo >= 0 && hi > lo, row.start);
        assert.equal(text.split(row.start).length, 2);
        assert.equal(hash(text.slice(lo, hi)), row.candidateSha256, row.start);
        text = text.slice(0, lo) + row.reviewed + text.slice(hi);
    }
    return text;
}
module.exports = {restoreOwned};
