import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {URL} from 'node:url';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const element = () => read('src/smart/table/index.js');
const styles = async () => (await read('src/smart/table/js/templates/default.css')).replace(/\/\*[\s\S]*?\*\//gu, '');

test('the person decides what is pinned, and the title column starts pinned', async () => {
  const source = await element();

  // Pinning was derived from the host's title role alone. The consumer's owner
  // made it the person's own setting on 2026-10-04: a toggle beside the
  // visibility box, stored with the order and the width, with the title column
  // pinned until the person says otherwise.
  assert.match(
    source,
    /isColumnPinned\(column\) \{[\s\S]*?if \(column\.key === "select" \|\| column\.key === "settings"\) return true;/u,
    'the box and the row menu are always pinned',
  );
  assert.match(
    source,
    /const chosen = pending\?\.pinned \?\? setting\.pinned \?\? column\.pinned;\s*if \(typeof chosen === "boolean"\) return chosen;\s*\n\s*return column\.role === "title";/u,
    'a stored answer wins, and without one the title column is the pinned one',
  );
  assert.match(
    source,
    /getPinnedColumnKeys\(columns = this\.getColumns\(\)\) \{\s*return columns[\s\S]*?this\.isColumnPinned\(column\)/u,
  );
  // The role is still what the host declares, and never a guess at the first
  // text column — that breaks on a page whose first column is an icon or a flag.
  assert.doesNotMatch(source, /isColumnPinned[\s\S]{0,400}?columns\[0\]/u);
  assert.match(
    source,
    /isPinnedColumn\(column\) \{[\s\S]*?if \(\["start", "end"\]\.includes\(column\.sticky\)\) return true;/u,
    'a column a host pinned through sticky stays pinned',
  );
  // The pinned ones stand first among the user columns, each group in its own
  // order, so pinning moves a column between groups and nothing else.
  assert.match(
    source,
    /const pinnedUserColumns = userColumns\.filter\(\(column\) => this\.isColumnPinned\(column\)\);\s*const looseUserColumns = userColumns\.filter\(\(column\) => !this\.isColumnPinned\(column\)\);/u,
  );
});

test('a pinned offset is measured on the page, never derived from a declared width', async () => {
  const source = await element();

  assert.match(
    source,
    /inset-inline-\$\{side\}: var\(--sf-table-pin-\$\{column\.key\}, 0px\)/u,
    'a cell names a property and nothing else',
  );
  assert.match(source, /isPinnedColumn\(column\)/u, 'and asks one question about the column');
  assert.match(
    source,
    /measurePinnedColumns\(\) \{[\s\S]*?cell\.getBoundingClientRect\(\)\.width/u,
    'the offsets come from the cells as rendered',
  );
  // The box and the row menu declare their widths as calc() over tokens, which
  // no arithmetic in the component can resolve, and a resized column no longer
  // has the width its description names. The old code summed declared widths
  // and fell back to 160px, which placed both system columns wrong.
  assert.doesNotMatch(
    source,
    /getStickyCellStyle[\s\S]{0,700}?Number\.parseFloat/u,
    'no declared-width arithmetic is left in the pinned offsets',
  );
  // On every render: at once, or -- when the cells' elements are still
  // drawing -- once they have drawn, in the same task (measureWhenCellsDrawn).
  assert.match(source, /afterRender\(\) \{[\s\S]{0,3000}?\n {12}this\.measurePinnedColumns\(\);/u, 'measured on every render');
  assert.match(source, /measureWhenCellsDrawn\(\) \{[\s\S]{0,2400}?this\.measurePinnedColumns\(\);/u, 'and after the cells have drawn');
  // The inline style places the cell and says nothing about its colour: it used
  // to paint the table surface, which beat every row state and left the pinned
  // columns white under a selected or hovered row.
  assert.doesNotMatch(source, /inset-inline-\$\{side\}[\s\S]{0,120}background/u, 'the placing does not paint');
  assert.match(
    source,
    /scroll\.addEventListener\("scroll", \(\) => this\.measurePinnedColumns\(\), \{passive: true\}\)/u,
    'and while the rows scroll',
  );
  assert.match(
    source,
    /\/\/ Resizing a pinned column moves every pinned column after it\.\s*this\.measurePinnedColumns\(\);/u,
    'and while a column is resized',
  );
});

test('the pinned edge carries a shadow only while something is behind it', async () => {
  const [source, css] = await Promise.all([element(), styles()]);

  assert.match(
    source,
    /const scrolled = Math\.abs\(scroll\.scrollLeft\) > 0;/u,
    'a right-to-left table reports the scroll position as a negative number',
  );
  assert.match(source, /scroll\.setAttribute\("data-sf-pin-scrolled", ""\)/u);
  assert.match(source, /cell\.setAttribute\("data-sf-pin-edge", ""\)/u, 'the cell that ends the block draws it');
  assert.match(
    css,
    /\.sf-table-scroll\[data-sf-pin-scrolled\] \[data-sf-pin-edge\]::after \{[\s\S]*?background-image: linear-gradient\(to right, var\(--sf-alpha-8\), transparent\);/u,
    'the shadow is the theme ink at 8 per cent, so it follows light and dark',
  );
  // A border would move the cell's content; the shadow has to lie over the rows
  // the pinned block overlaps.
  assert.match(css, /\[data-sf-pin-edge\]::after \{[\s\S]*?position: absolute;/u);
});
