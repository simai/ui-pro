// sf-chat-window 1.15.0 (R208 gaps 9 and 10): «Мои файлы» on their way are
// sf-skeleton rows in the list's own shape, not a bare words line, and the
// empty or failed list's sf-empty-state is named by heading, never by the
// dated alias title (sf-empty-state 1.1.0, removed after 2026-12-01). The view
// imports lit through sf-chat-message, which the suite does not resolve, so
// this half reads the source and the declarations.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const folder = join(root, 'src', 'smart', 'chat-window');
const json = (path) => JSON.parse(readFileSync(join(folder, path), 'utf8'));
const source = readFileSync(join(folder, 'js', 'files-view.js'), 'utf8');
const method = (name) => {
  const start = source.indexOf(`\n  ${name}(`);
  assert.ok(start > 0, name);
  const end = source.indexOf('\n  }\n', start);
  return source.slice(start, end);
};

test('the list on its way is sf-skeleton rows, aria-hidden, with the words offscreen', () => {
  const draw = method('draw');
  assert.match(draw, /this\.body\.replaceChildren\(\.\.\.this\.loadingRows\(\)\)/u);
  assert.doesNotMatch(draw, /files\.loading/u, 'no words line of its own');
  const rows = method('loadingRows');
  assert.match(rows, /'sf-chat-offscreen chat-files__loading'/u);
  assert.match(rows, /this\.words\('files\.loading'\)/u);
  assert.match(rows, /setAttribute\('aria-hidden', 'true'\)/u);
  assert.match(rows, /createElement\('sf-skeleton'\)/u);
  assert.match(rows, /className = 'chat-files__item'/u, 'the rows keep the list grid');
  assert.match(rows, /kind: 'rounded', width: square, height: square/u, 'the glyph square');
  assert.equal(rows.match(/kind: 'text'/gu).length, 2, 'the name over its facts');
});

test('the empty state is named by heading, not by the dated alias title', () => {
  const state = method('emptyState');
  assert.match(state, /setAttribute\('heading', heading\)/u);
  assert.doesNotMatch(source, /setAttribute\(\s*['"]title['"]/u);
});

test('the rule fetches what the view draws, and the version says so', () => {
  const component = json('component.json');
  assert.equal(component.version, '1.15.0');
  assert.ok(component.relations.some((one) => one.name === 'cl-skeleton' && one.lazy === true));
  assert.ok(json('smart.manifest.json').composition.uses.includes('smart.skeleton'));
  assert.match(readFileSync(join(folder, 'rule.js'), 'utf8'), /\{ name: 'cl-skeleton', lazy: true \}/u);
});
