import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const source=readFileSync(new URL('../src/smart/admin-menu/index.js',import.meta.url),'utf8');
test('Admin anchors to the native control rather than a display-contents Smart host',()=>{
  assert.match(source,/const anchor = opener \|\| target;/);
  assert.match(source,/const pos = anchor.getBoundingClientRect\(\)/);
  assert.match(source,/this\._contextAnchor = null;/);
  assert.match(source,/const box = anchor.element.getBoundingClientRect\(\)/);
});
test('Admin converts logical sides into physical measured viewport coordinates',()=>{
  assert.match(source,/getComputedStyle\(surface\).direction === "rtl"/);
  assert.match(source,/anchor.position.startsWith\("left"\) !== rtl/);
  assert.match(source,/surface.style.insetInlineStart = "auto"/);
  assert.match(source,/surface.style.insetInlineEnd = "auto"/);
  assert.match(source,/surface.style.transform = "none"/);
  assert.match(source,/anchor.element.isConnected/);
});
