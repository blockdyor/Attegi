// Only this inverse delta is used for historical hash authentication, never candidate comparisons.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const hash = text => createHash('sha256').update(text).digest('hex');
const source = fs.readFileSync(new URL('../../../src/js/libs/highlight.pack.js', 'file://' + __filename), 'utf8');
const fixtureBytes = fs.readFileSync(new URL('../highlight-vendor-baseline.json', 'file://' + __filename));
assert.equal(hash(fixtureBytes), 'da0611caaa33defe1f4324d8e63883832aec730bc6a97625c2c665dd59224f5c');
const fixture = JSON.parse(fixtureBytes);
assert.equal(fixture.originalFunctions.length, 27);
const old = 'n.position=this.position++,this.matchIndexes[this.matchAt]=n';
const fixed = 'n=Object.assign({},n,{position:this.position++}),this.matchIndexes[this.matchAt]=n';
function undoOwnership(text) {
    const needle = text.includes(fixed) ? fixed : old;
    assert.equal(text.split(needle).length, 2);
    return text.replace(needle, old);
}
const base = undoOwnership(source);
assert.equal(hash(base), '3a8c910fdf1aefe17c35704718529ee15673d2521cae84a427916c2ada4c2a79');
let original = source;
for (const row of fixture.originalFunctions) {
    const lo = original.indexOf(row.start), hi = original.indexOf(row.end, lo);
    assert(lo >= 0 && hi > lo);
    original = original.slice(0, lo) + row.source + original.slice(hi);
}
original = original.replaceAll('.sort((a,b)=>a<b?-1:a>b?1:0).reverse()', '.sort().reverse()')
    .replace('grmr_wasm:e=>{const', 'grmr_wasm:e=>{e.regex;const')
    .replace('h=_.concat([{begin:/\\(/', 'h=_.concat([{begin:/(\\s*)\\(/')
    .replace('  Attegi local maintenance: statement-form mode transforms, explicit UTF-16\n' +
        '  string sorting, and removal of an unused WASM regex data-property read.\n' +
        '  Based on upstream 11.12.0; not byte-identical. Recursive JS parameter scan repaired.\n', '');
assert.equal(hash(original), '8ab71eb09c51f501e5e25157d9cff100e46cc29bcbfc744d0b746d451fca7f53');
function load(text = source) {
    const context = vm.createContext({ console });
    vm.runInContext(text, context);
    return context.hljs;
}
module.exports = { source, base, original, hash, load, undoOwnership };
