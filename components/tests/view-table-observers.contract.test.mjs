// sf-view-table does no layout work inside its resize observers (DEV
// PRO-ADM-12, 2026-11-16): written there, the columns and the rail resized
// what is observed in the same frame, and at 390 the application example
// logged «ResizeObserver loop completed with undelivered notifications» on
// every load. The page-level count (0 of 6 loads, before 6 of 6) is in
// ui-control control/evidence/2026-11-17-pro-over-gb9.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const callbacks = (source) => [...source.matchAll(/new ResizeObserver\(([\s\S]*?)\n\s*\}\);/gu)].map(([, body]) => body);

test('every resize observer of the table hands its work to the next frame', () => {
  const found = callbacks(read('src/smart/view-table/index.js'));
  assert.equal(found.length, 2, 'the columns\' observer and the rail\'s');
  for (const body of found) {
    assert.match(body, /requestAnimationFrame\(/u, 'the work waits for the next frame');
    const sync = body.slice(0, body.indexOf('requestAnimationFrame('));
    assert.doesNotMatch(sync, /requestComponentUpdate|measurePinnedColumns|syncRail\(\)/u, 'nothing is laid out inside the callback');
  }
});

test('the table\'s icon buttons are ghost, not the dated link look (C15)', () => {
  const sources = read('src/smart/view-table/index.js') + read('src/smart/view-table/js/templates/default.js');
  assert.doesNotMatch(sources, /sf-icon-button--link/u);
  for (const block of sources.split(/type: ['"]button-icon['"]/u).slice(1)) {
    const props = block.slice(0, block.indexOf('}'));
    assert.doesNotMatch(props, /appearance: ['"]link['"]/u);
  }
});
