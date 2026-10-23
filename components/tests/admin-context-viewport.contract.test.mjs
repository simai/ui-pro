import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const source=readFileSync(new URL('../src/smart/admin-menu/index.js',import.meta.url),'utf8');
const styles=readFileSync(new URL('../src/component/context-menu/scss/_css__context_menu_custom.scss',import.meta.url),'utf8');

test('Admin popup measures a semantic viewport token rather than a fixed margin',()=>{
  assert.match(styles,/--sf-context-menu-viewport-space: var\(--sf-space-1\\\/2\)/);
  assert.match(source,/const resolvedSpace = ruler\.getBoundingClientRect\(\)\.width/);
  assert.match(source,/ruler\.remove\(\)/);
  assert.doesNotMatch(source,/const margin = 8;/);
  assert.match(source,/viewport\?\.offsetLeft/);
  assert.match(source,/viewport\?\.offsetTop/);
});

test('Admin popup geometry listeners and pending work have symmetric cleanup',()=>{
  for(const receiver of ['window','window.visualViewport?']){
    assert.ok(source.includes(`${receiver}.addEventListener("resize", this.scheduleContextGeometry)`));
    assert.ok(source.includes(`${receiver}.removeEventListener("resize", this.scheduleContextGeometry)`));
  }
  assert.match(source,/document\.addEventListener\("scroll", this\.contextScrollEvent, true\)/);
  assert.match(source,/document\.removeEventListener\("scroll", this\.contextScrollEvent, true\)/);
  assert.match(source,/cancelAnimationFrame\(this\._contextGeometryFrame\)/);
  assert.match(source,/this\._contextSizeObserver\?\.disconnect\(\)/);
  assert.match(source,/initial\.left === node\?\.scrollLeft && initial\.top === node\?\.scrollTop/);
  assert.match(styles,/scroll-behavior: auto;/);
});
