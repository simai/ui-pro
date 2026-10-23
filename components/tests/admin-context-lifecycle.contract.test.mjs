import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const source=readFileSync(new URL('../src/smart/admin-menu/index.js',import.meta.url),'utf8');
const template=readFileSync(new URL('../src/smart/admin-menu/js/templates/default.js',import.meta.url),'utf8');

test('Admin context menu bounds portal ownership and stale focus callbacks',()=>{
  assert.match(source,/contextPortalOwners\.get\(this\._contextPortal\) === this/);
  assert.match(source,/previousOwner\.closeContextMenu\(\{restoreFocus: false\}\)/);
  assert.match(source,/event\.currentTarget instanceof Element/);
  assert.match(source,/token !== this\._contextOpenToken/);
  assert.match(source,/menu\.availableMenuItems\?\.\(\)\.length/);
  assert.match(source,/document\.activeElement !== document\.body/);
});

test('Admin context menu pairs dismissal listeners and names its native settings opener',()=>{
  for(const [event,handler] of [['click','contextEvent'],['keydown','contextKeyEvent'],['focusin','contextFocusEvent']]){
    assert.ok(source.includes(`document.addEventListener("${event}", this.${handler})`));
    assert.ok(source.includes(`document.removeEventListener("${event}", this.${handler})`));
  }
  assert.match(template,/aria-label=\$\{menuText\("personalSettings"\)\}/);
  assert.match(template,/aria-haspopup="menu"/);
  assert.match(template,/data-action="settings"/);
});
