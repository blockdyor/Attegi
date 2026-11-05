const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const source = fs.readFileSync(path.resolve(__dirname, '../../src/js/features/tag-cards.js'), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/export function /g, 'function ');

function setup({complete = false, naturalWidth = 0, blockedCanvas = false} = {}) {
  const listeners = [];
  const probes = [];
  const colors = [];
  const img = {
    complete, naturalWidth, currentSrc: 'https://images.example/responsive.webp', src: 'https://images.example/fallback.webp',
    addEventListener(type, callback, options) {listeners.push({type, callback, options});}
  };
  const card = {querySelector: () => img, style: {setProperty: (...args) => colors.push(args)}};
  vm.runInNewContext(`${source}\ninitTagCards();`, {
    qs: () => ({}),
    qsa: selector => selector === '.tag-card.has-image' ? [card] : [],
    each: (items, callback) => items.forEach(callback),
    Image: class {
      constructor() {probes.push(this);}
      set src(value) {this.requestedSource = value;}
    },
    document: {createElement: () => ({getContext: () => ({
      drawImage() {},
      getImageData() {
        if (blockedCanvas) throw new Error('CORS');
        return {data: new Uint8ClampedArray([80, 120, 160, 255])};
      }
    })})}
  });
  return {probes, colors, listeners};
}

test('unloaded lazy tag image starts no detached image request', () => {
  const state = setup();
  assert.equal(state.probes.length, 0);
  assert.equal(state.listeners.length, 1);
  assert.equal(state.listeners[0].type, 'load');
  assert.equal(state.listeners[0].options.once, true);
});

test('loaded tag image samples its displayed responsive source', () => {
  const state = setup();
  assert.equal(state.probes.length, 0);
  state.listeners[0].callback();
  assert.equal(state.probes.length, 1);
  assert.equal(state.probes[0].crossOrigin, 'anonymous');
  assert.equal(state.probes[0].requestedSource, 'https://images.example/responsive.webp');
  state.probes[0].onload();
  assert.equal(state.colors[0][0], '--tag-image-color');
});

test('cached loaded tag images still get their color immediately', () => {
  assert.equal(setup({complete: true, naturalWidth: 640}).probes.length, 1);
});

test('failed tag images do not start a second request', () => {
  assert.equal(setup({complete: true, naturalWidth: 0}).probes.length, 0);
});

test('blocked canvas reads retain the existing fallback color', () => {
  const state = setup({complete: true, naturalWidth: 640, blockedCanvas: true});
  assert.doesNotThrow(() => state.probes[0].onload());
  assert.equal(state.colors.length, 0);
});
