// sf-chat-message 1.7.8 (C144, RG-S1-28): the buttons under an answer are a
// row of actions, not a toolbar. A toolbar is a panel of tools 4 apart with
// role toolbar and one Tab stop (C144, C184); this row mixes the sources chip,
// the check, copy, the rating, the time and a menu, every button its own Tab
// stop, so it stands as a row of actions: 8 apart (H5, --sf-space-1/3; 4 in
// the compact density), the divider between what the answer is and its
// actions taking the row's gap on each side and no margin of its own.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(join(root, 'src', 'smart', 'chat-message', path), 'utf8');
const rule = (css, selector) => {
  const at = css.indexOf(`  ${selector} {`);
  assert.notEqual(at, -1, selector);
  return css.slice(at, css.indexOf('}', at));
};

test('C144: the action row under an answer is 8 apart, a row of actions', () => {
  const css = read('js/templates/default.css');
  assert.match(css, /--sf-chat-message--gap: var\(--sf-space-1\\\/3\);/u);
  assert.match(rule(css, '.sf-chat-message__actions'), /\bgap: var\(--sf-chat-message--gap\);/u);
  assert.doesNotMatch(rule(css, '.sf-chat-message__divider'), /margin-inline/u, 'the divider takes the row gap on each side');
});

test('C144: a row of actions is no toolbar: no role toolbar, every button a Tab stop', () => {
  const source = read('js/view/message.js');
  const at = source.indexOf('function renderActions(');
  const body = source.slice(at, source.indexOf('\n}\n', at));
  assert.match(body, /element\(ctx, 'div', 'sf-chat-message__actions'\)/u);
  assert.doesNotMatch(body, /toolbar|tabindex/u);
});

test('the version says it', () => {
  const manifest = JSON.parse(read('component.json'));
  assert.equal(manifest.version, '1.7.8');
  assert.equal(JSON.parse(read('smart.manifest.json')).version, '1.7.8');
  assert.ok(manifest.changelog?.some?.((line) => line.startsWith('version 1.7.8')) ?? JSON.stringify(manifest).includes('version 1.7.8'));
});
