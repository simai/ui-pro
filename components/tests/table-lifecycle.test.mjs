import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/smart/table/index.js',import.meta.url),'utf8');

test('table disconnect keeps base cleanup and releases its transient state',()=>{
  const body=source.split('    disconnectedCallback() {')[1].split('\n    templateContext()')[0];
  for (const expected of [
    'this.tempSettings = null',
    'this.state.contextMenu = {open: false}',
    'this.refs.contextMenu.value = null',
    'this.contextTarget = null',
    'this._portalContainer.remove()',
    'super.disconnectedCallback()',
  ]) assert.ok(body.includes(expected), expected);
});
