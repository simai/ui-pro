import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/smart/table/index.js',import.meta.url),'utf8');
const body=source.split('    contextEvent(event) {')[1].split('\n    splitItemsByColumns(')[0].trim().replace(/\}\s*$/,'');
const contextEvent=new Function('event',body);
for(const menu of ['tag-settings','filter-settings']) {
  test(`outside dismissal discards ${menu} draft without altering applied state`,()=>{
    const applied={values:{name:{value:'Applied'}}}; let closes=0;
    const owner={state:{contextMenu:{menu},filter:applied},tempSettings:{filter:{values:{name:{value:'Draft'}}}},isContextMenuEvent:()=>false,closeContextMenu(){closes++;}};
    contextEvent.call(owner,{});
    assert.equal(owner.tempSettings,null); assert.equal(owner.state.filter,applied); assert.equal(closes,1);
  });
}
test('inside filter interaction preserves draft and does not dismiss',()=>{
  const draft={filter:{values:{name:{value:'Draft'}}}};
  const owner={state:{contextMenu:{menu:'tag-settings'}},tempSettings:draft,isContextMenuEvent:()=>true,closeContextMenu(){assert.fail('must not close');}};
  contextEvent.call(owner,{});assert.equal(owner.tempSettings,draft);
});
