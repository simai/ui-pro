import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../src/smart/table/js/templates/default.js',import.meta.url),'utf8');
const body=source.split('function renderComponent(component, owner) {')[1].split('\nfunction renderCellItem(')[0].trim().replace(/\}\s*$/,'');
const render=new Function('component','owner','nothing',body);
test('table rendering preserves caller key and never mutates component props',()=>{
  const props=Object.freeze({text:'View',':key':'row-1-view'});
  const calls=[];const owner={renderSmartElement:(type,p)=>{calls.push({...p});return p;}};
  render({type:'button',props},owner,null);render({type:'button',props},owner,null);
  assert.deepEqual(calls,[props,props]);
});
test('unkeyed table cells do not acquire a random identity on each render',()=>{
  const component={type:'button',props:{text:'View'}};
  const owner={renderSmartElement:(_,p)=>({...p})};
  assert.deepEqual(render(component,owner,null),{text:'View'});
  assert.deepEqual(render(component,owner,null),{text:'View'});
});
