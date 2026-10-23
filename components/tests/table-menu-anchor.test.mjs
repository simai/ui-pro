import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source = fs.readFileSync(new URL('../src/smart/table/index.js', import.meta.url), 'utf8');
const body = source.split('    openContextMenu(event, opts = {}) {')[1].split('\n    // The element to anchor to')[0].trim().replace(/\}\s*$/, '');
class Element {
 constructor(rect, parent=null, native=false) { this.rect=rect; this.parent=parent; this.native=native; this.children=[]; this.classList={add(){},remove(){}}; parent?.children.push(this); }
 querySelectorAll() { return this.children.flatMap((child) => [child, ...child.querySelectorAll()]); }
 contains(node) { return node === this || Boolean(node?.parent && this.contains(node.parent)); }
 closest() { return this.native ? this : this.parent?.closest() || null; }
 getBoundingClientRect() { return this.rect; }
}
const open = new Function('Element','getParent',`return function(event,opts={}) {${body}}`)(Element, x=>x.parent);
function invoke(target,path,type='left') {
 const owner={closeContextMenu(){},describeContextAnchor(){return null;},set(value){this.state=value;}};
 open.call(owner,{currentTarget:target,target:path[0],composedPath:()=>path,preventDefault(){},stopPropagation(){}},{type});
 return owner;
}
test('display:contents opener anchors to native button even when icon is clicked',()=>{
 const host=new Element({left:0,y:0,width:0,height:0});
 const button=new Element({left:62,y:319,width:36,height:36},host,true);
 const icon=new Element({},button);
 const owner=invoke(host,[icon,button,host]);
 assert.equal(owner.contextTarget,button);
 assert.equal(owner.state.contextMenu.x,98);
 assert.equal(owner.state.contextMenu.y,337);
});
test('foreign native controls cannot become the anchor',()=>{
 const host=new Element({left:40,y:50,width:20,height:10});
 const foreign=new Element({left:0,y:0,width:999,height:999},null,true);
 const owner=invoke(host,[foreign,host],'bottom');
 assert.equal(owner.contextTarget,host);
 assert.equal(owner.state.contextMenu.x,40);
 assert.equal(owner.state.contextMenu.y,60);
});
test('native opener and synthetic events retain their geometry',()=>{
 const button=new Element({left:10,y:20,width:30,height:40},null,true);
 const owner=invoke(button,[]);
 assert.equal(owner.contextTarget,button);
 assert.equal(owner.state.contextMenu.x,40);
 assert.equal(owner.state.contextMenu.y,40);
});

test('viewport x coordinates use physical left positioning in RTL too',()=>{
 assert.doesNotMatch(source, /inset-inline-start: (?:calc\()?\$\{x\}/);
 assert.match(source, /left: calc\(\$\{x\}px/);
});

test('boxless opener without a native control anchors to its first rendered box (sf-tag chip)',()=>{
 const host=new Element({left:0,y:0,width:0,height:0});
 const chip=new Element({left:469,y:122,width:80,height:24},host);
 const text=new Element({left:480,y:126,width:40,height:16},chip);
 const owner=invoke(host,[text,chip,host],'bottom');
 assert.equal(owner.contextTarget,chip);
 assert.equal(owner.state.contextMenu.x,469);
 assert.equal(owner.state.contextMenu.y,146);
 assert.equal(owner.state.contextMenu.anchor,chip);
});
