import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

// The kit names three row actions of its own -- edit, view, delete -- and the
// row menu paints a danger entry in `error`. Until 2026-10-22 none of the three
// carried `danger`, so a host that left row actions to the table got «Удалить»
// drawn like «Изменить», and a host that wanted the red row had to name delete
// in its own catalogue to say what the kit already knows (Larena storage QA).
const table = fs.readFileSync(new URL('../src/smart/table/index.js', import.meta.url), 'utf8');
const view = fs.readFileSync(new URL('../src/smart/data-view/index.js', import.meta.url), 'utf8');
const literal = table.split('this.ACTIONS_SETTINGS_ROW =')[1].split('];')[0] + ']';
// `return` and a newline is `return undefined`: the literal is parenthesised.
const catalogue = new Function(`return (${literal})`).call({text: (key) => key});

test('the kit marks its own delete destructive and nothing else', () => {
  assert.deepEqual(catalogue.map((action) => action.id), ['edit', 'view', 'delete']);
  const marked = catalogue.filter((action) => action.danger === true).map((action) => action.id);
  assert.deepEqual(marked, ['delete']);
  // The icon in the actions column states its own scheme; the mark is a fact
  // about the action, not a repaint of every table's inline buttons.
  assert.deepEqual(catalogue.map((action) => action.component.props.scheme),
    ['on-surface', 'on-surface', 'on-surface']);
});

test('the row menu carries the mark through, for an action and for a group member', () => {
  assert.match(table, /\{id: action\.id, text: action\.name, icon: iconOf\(action\), danger: action\.danger === true\}/u);
  assert.match(table, /\{id: member\.id, text: member\.name, icon: iconOf\(member\), danger: member\.danger === true\}/u);
  assert.match(table, /scheme: member\.danger \? "error" : "on-surface"/u);
});

test('a host that narrows the catalogue keeps the kit mark', () => {
  // data-view hands back the table's own entry untouched for an id its own
  // catalogue does not name, so the mark survives the projection.
  assert.match(view, /const found = known\.find\(\(action\) => action\.id === id\);\s*\n\s*if \(found\) return found;/u);
});
