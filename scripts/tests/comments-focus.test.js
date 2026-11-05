const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const source = fs.readFileSync(path.resolve(__dirname, '../../src/js/features/comments.js'), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/export function /g, 'function ');

function setup(withObserver = true) {
  let intersect;
  const frames = [];
  const attributes = {};
  const listeners = {};
  let appended = 0;
  const unrelated = {};
  const doc = {body: {}, activeElement: unrelated};
  const trigger = {
    classList: {add() {}, remove() {}},
    addEventListener: (name, callback) => {listeners[name] = callback;},
    setAttribute(name, value) {
      attributes[name] = value;
      if (name === 'hidden' && doc.activeElement === trigger) doc.activeElement = doc.body;
    },
    removeAttribute: name => {delete attributes[name];}
  };
  const placeholder = {
    appendChild() {appended++;},
    setAttribute() {},
    focus() {doc.activeElement = placeholder;}
  };
  const template = {content: {cloneNode: () => ({querySelectorAll: () => []})}};
  doc.getElementById = () => template;
  const Observer = class {
    constructor(callback) {intersect = callback;}
    observe() {}
    disconnect() {}
  };
  vm.runInNewContext(`${source}\nsetupLazyComments();`, {
    doc, qs: selector => selector === '.js-load-comments' ? trigger : placeholder,
    window: withObserver ? {IntersectionObserver: Observer} : {},
    IntersectionObserver: Observer,
    requestAnimationFrame: callback => frames.push(callback)
  });
  return {
    doc, trigger, placeholder, unrelated, attributes,
    intersect: () => intersect([{isIntersecting: true}]),
    click: () => listeners.click({type: 'click'}),
    flush: () => {while (frames.length) frames.shift()();},
    appended: () => appended
  };
}

test('automatic comments loading leaves unrelated keyboard focus untouched', () => {
  const state = setup();
  state.intersect(); state.flush();
  assert.equal(state.appended(), 1);
  assert.equal(state.doc.activeElement, state.unrelated);
});

test('automatic loading does not hide the currently focused comments trigger', () => {
  const state = setup(); state.doc.activeElement = state.trigger;
  state.intersect(); state.flush();
  assert.equal(state.doc.activeElement, state.trigger);
  assert.equal(state.appended(), 0);
});

test('explicit focused activation moves focus into loaded comments', () => {
  const state = setup(false); state.doc.activeElement = state.trigger;
  state.click(); state.flush();
  assert.equal(state.appended(), 1);
  assert.equal(state.attributes.hidden, 'true');
  assert.equal(state.doc.activeElement, state.placeholder);
});

test('comments loading does not recapture focus after the reader moves away', () => {
  const state = setup(); state.doc.activeElement = state.trigger;
  state.click(); state.doc.activeElement = state.unrelated; state.flush();
  assert.equal(state.doc.activeElement, state.unrelated);
});
