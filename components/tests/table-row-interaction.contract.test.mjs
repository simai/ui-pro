import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {URL} from 'node:url';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const element = () => read('src/smart/table/index.js');
const template = () => read('src/smart/table/js/templates/default.js');

test('a click moves the row the person is on, and nothing else', async () => {
  const [source, markup] = await Promise.all([element(), template()]);

  assert.match(markup, /\(event\) => component\.handleRowClick\(event, row, index\)/u);
  // Wherever in the row the click lands. Skipping clicks on anything
  // interactive was the first answer, and a consumer whose cells are links
  // found it: clicking the only content a cell has moved nothing. A control
  // still does its own work; only opening the record stays off limits from one.
  assert.match(
    source,
    /handleRowClick\(event, row, index = -1\) \{\s*this\.focusRow\(this\.getRowKey\(row, index\)\);\s*this\.openReferenceFromCell\(event, row\);\s*return this;/u,
    'a click anywhere in the row moves the current row; a link to another record asks to open it (owner, 2026-10-14)',
  );
  assert.match(
    source,
    /handleRowOpen\(event, row\) \{\s*if \(this\.isRowControlTarget\(event\?\.target\)/u,
    'and the control exemption stays where it belongs',
  );
  // The click must not mark the row: marking is what a bulk action runs on, so
  // a stray click would destroy a selection the person had built up.
  assert.doesNotMatch(
    source,
    /handleRowClick\(event, row\) \{[\s\S]{0,400}?applyRowSelection/u,
    'a click never marks the row',
  );
  assert.match(markup, /data-current=\$\{context\.component\.isCurrentRow\(row, rowIndex\) \? '' : nothing\}/u);
  // Keyed the way the rest of the template keys a row: id, then value, then
  // position. The current row followed `id` alone, so in a view whose rows
  // carry another key a click marked nothing and looked broken.
  assert.match(
    source,
    /getRowKey\(row, index = -1\) \{\s*const value = row\?\.id \?\? row\?\.value;/u,
  );
  assert.match(markup, /data-row-id=\$\{context\.component\.getRowKey\(row, rowIndex\)\}/u);
  // Marked in the page, not through state. Going through state re-rendered the
  // rows on every click, and a render between a box's click and its change
  // event swallowed the change — one click on a row lost a Shift-range
  // selection. The template reads the field back, so a later render keeps it.
  assert.match(
    source,
    /focusRow\(rowId, \{reveal = false\} = \{\}\) \{[\s\S]*?this\._currentRowId = String\(rowId\);[\s\S]*?removeAttribute\("data-current"\)[\s\S]*?setAttribute\("data-current", ""\)/u,
  );
  assert.doesNotMatch(source, /currentRowId: null,/u, 'the current row is not table state');
  assert.match(markup, /tabindex="-1"/u, 'the row can take focus, so the keyboard can act on it');
});

test('a double click opens the record only when the record offers it', async () => {
  const [source, markup] = await Promise.all([element(), template()]);

  assert.match(markup, /@dblclick=\$\{\(event\) => context\.component\.handleRowOpen\(event, row\)\}/u);
  assert.match(
    source,
    /canOpenRow\(row\) \{\s*return Array\.isArray\(row\?\.actions\) && row\.actions\.includes\("view"\);/u,
    'the row has to offer the view action',
  );
  assert.match(
    source,
    /handleRowOpen\(event, row\) \{\s*if \(this\.isRowControlTarget\(event\?\.target\) \|\| !this\.canOpenRow\(row\)\) return this;/u,
    'otherwise the double click does nothing',
  );
  // The table raises the view intent it already has; the data view turns a
  // single-row view intent into record.open and checks the host capability
  // there. A second path would make the table decide what the host can do.
  assert.match(source, /return this\.requestActionIntent\("view", \[id\]\);/u);
  assert.doesNotMatch(source, /dispatchTableEvent\(['"]record\.open/u, 'the table never raises record.open itself');
});

test('a press settles the range and stops the text selection a drag would make', async () => {
  const [source, markup] = await Promise.all([element(), template()]);

  assert.match(markup, /@mousedown=\$\{\(event\) => context\.component\.handleRowPointerDown\(event\)\}/u);
  assert.match(
    source,
    /handleRowPointerDown\(event\) \{\s*this\._selectRangeModifier = event\?\.shiftKey === true;\s*if \(event\?\.shiftKey === true \|\| event\?\.detail > 1\) \{\s*event\.preventDefault\?\.\(\);/u,
    'Shift and a second click would otherwise select the text of every row they pass over',
  );
  // The modifier is read at the press and not at the change: a checkbox change
  // event carries no modifier state, which is why this is not read there.
  assert.match(source, /range: this\._selectRangeModifier === true/u);
});

test('Shift and the box mark a range, and the page box is computed from the rows', async () => {
  const source = await element();

  assert.match(
    source,
    /applyRowSelection\(rowId, checked, \{range = false\} = \{\}\) \{[\s\S]*?const anchorIndex = range && this\._selectionAnchorId != null/u,
    'the range runs from the row marked last to this one',
  );
  assert.match(
    source,
    /const from = anchorIndex < 0 \? index : Math\.min\(anchorIndex, index\);\s*const to = anchorIndex < 0 \? index : Math\.max\(anchorIndex, index\);/u,
    'in either direction',
  );
  // The value is the one the clicked box just took, so a Shift-click unmarks a
  // range as well as marking one.
  assert.match(source, /selected: checked,\s*checked,/u);
  assert.match(source, /this\._selectionAnchorId = rowId;/u, 'the clicked row becomes the next anchor');
  assert.match(
    source,
    /syncSelectAllState\(\) \{\s*const count = this\.getSelectedRecordIds\(\)\.length;\s*const total = this\.getTableData\(\)\.rows\.length;/u,
    'the page box is derived from the rows, not counted as they are clicked',
  );
  assert.match(
    source,
    /clearSelection\(\) \{\s*this\._selectionAnchorId = null;/u,
    'clearing the selection drops the anchor with it',
  );
  // Marking the whole page leaves no single row to extend from.
  assert.match(source, /this\._selectionAnchorId = null;\s*this\.set\(\{selectIndeterminate: false, settingsChecked: checked\}\)/u);
});

test('the keyboard reaches the same two answers as the pointer', async () => {
  const [source, markup] = await Promise.all([element(), template()]);

  assert.match(markup, /@keydown=\$\{\(event\) => context\.component\.handleRowKeydown\(event, row\)\}/u);
  assert.match(source, /if \(event\.key === "Enter"\) \{\s*return this\.handleRowOpen/u, 'Enter opens the row');
  assert.match(
    source,
    /if \(event\.key === " " \|\| event\.key === "Spacebar"\) \{[\s\S]*?applyRowSelection\(row\?\.id, checked, \{range: event\.shiftKey === true\}\)/u,
    'Space marks it, and Shift+Space marks the range',
  );
  // A key pressed inside a control in the row belongs to that control.
  assert.match(source, /if \(event\?\.target !== event\?\.currentTarget\) return this;/u);
});

test('a column move survives the render a host answer brings with it', async () => {
  const source = await element();

  // The order is worked out from the heading row's keys when the drop asks for
  // it, and applied through the settings; nothing the drag did is in the DOM,
  // so a render a host answer brings mid-drag has nothing to undo. The row the
  // drag is attached to is attached again when a render replaces it.
  assert.match(source, /onHeaderColumnIntent\(\{item, index, group\}\) \{\s*const table = this\.refs\.table\?\.value;\s*const shown = \[\.\.\.\(table\?\.tHead\?\.rows\?\.\[0\]\?\.cells/u);
  assert.match(source, /if \(!row \|\| this\._headerSortableRow === row\) return;/u);
});

test('a quick drag still decides where the column lands', async () => {
  const source = await element();

  // The drop decides on release, in the Framework's sortable, with no frame
  // in between to lose; the table applies what it is asked at once.
  assert.match(source, /onIntent: \(detail\) => this\.onHeaderColumnIntent\(detail\),/u);
});
test('a move rearranges the visible columns among the places they already hold', async () => {
  const source = await element();

  // Numbering every draggable column from ten upward renumbered columns the
  // person cannot see as well, and a hidden column has no place on screen to be
  // numbered from — so they came out ahead of everything. A consumer dropped one
  // column one place to the left and found its nine visible columns pushed
  // behind seven it had never shown.
  assert.match(source, /const slots = this\.getColumnOrderSlots\(userKeys\);/u);
  assert.match(source, /order: slots\[index\],/u);
  assert.doesNotMatch(source, /order: \(index \+ 1\) \* 10,\s*\};/u, 'no blind renumbering from ten');
  assert.match(
    source,
    /getColumnOrderSlots\(userKeys = \[\]\) \{[\s\S]*?const taken = userKeys[\s\S]*?\.sort\(\(left, right\) => left - right\);/u,
    'the places are the ones those columns already hold',
  );
  // Two columns can share a place when a host sends the same order twice.
  assert.match(
    source,
    /if \(taken\.length !== userKeys\.length \|\| distinct\.size !== taken\.length\) \{\s*return userKeys\.map\(\(_, index\) => \(index \+ 1\) \* 10\);/u,
  );
});
