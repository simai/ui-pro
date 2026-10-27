import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {URL} from 'node:url';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const styles = () => read('src/smart/table/js/templates/default.css');
// The comments beside these rules explain what was rejected and why, so the
// guards read declarations rather than prose.
const declarations = async () => (await styles()).replace(/\/\*[\s\S]*?\*\//gu, '');

test('a sorted column is answered in its header, never by shading the column', async () => {
  const css = await declarations();

  assert.match(
    css,
    /th\[aria-sort\]:not\(\[aria-sort="none"\]\) \.sf-table-sort-button \{\s*color: var\(--sf-primary\);/u,
    'the label of a sorted column takes the primary role',
  );
  assert.match(
    css,
    /th\[aria-sort\]:not\(\[aria-sort="none"\]\)::after \{[\s\S]*?block-size: var\(--sf-a2\);[\s\S]*?background-color: var\(--sf-primary\);/u,
    'the mark under a sorted header is two steps of the size scale, in the primary role',
  );
  // Paler than the header's text, by the one role an icon has for that. It was
  // --sf-on-surface-muted, a step paler still, which measures 3.18:1 light and
  // 2.92:1 dark where WCAG 1.4.11 asks 3:1 of non-text graphics.
  assert.match(
    css,
    /th:hover \.sf-table-sort-icon \{[\s\S]*?--sf-icon--color: var\(--sf-on-surface-variant\);/u,
    'a sortable header offers a paler icon on hover',
  );
  // Shading the whole column is what the request ruled out, so no rule may give
  // a sorted column's cells a background of their own.
  assert.doesNotMatch(
    css,
    /\[aria-sort\](?![\s\S]{0,200}::after)[\s\S]{0,200}background-color/u,
    'a sorted column keeps the background every other column has',
  );
});

test('a row says whether it is selected, and the look follows from that', async () => {
  const [template, css] = await Promise.all([
    read('src/smart/table/js/templates/default.js'),
    declarations(),
  ]);

  // The row's strings are composed per arrangement of cells (§18.4): the
  // attribute is the first hole, filled from the row's box.
  assert.match(template, /const pieces = \['<tr data-selected=', ROW_HOLE,/u);
  assert.match(
    template,
    /const values = \[\s*row\.select\?\.component\?\.props\?\.checked === true \? '' : nothing,/u,
    'the row carries the state instead of the style reading the checkbox in a cell',
  );
  // `aria-selected` is not used: a plain table's rows are not grid rows, and the
  // checkbox already carries the state for assistive technology.
  assert.doesNotMatch(template, /<tr aria-selected/u, 'the row makes no ARIA claim the table does not back');

  // The colour moved from the cells to the row when the columns started to
  // pin: a pinned cell must be opaque in the colour of its own row, which it
  // can only be by inheriting it.
  // A row is two layers: an opaque surface and the state as a tint over it.
  // Every state colour is an alpha colour, so a pinned cell that inherited one
  // flattened result painted the tint twice and came out darker than its row.
  assert.match(css, /tbody tr \{\s*background-color: var\(--sf-table-row--background-color, var\(--sf-surface-0\)\);/u);
  assert.match(css, /tbody tr:hover \{\s*background-image: linear-gradient\(\s*var\(--sf-surface-container-hover\),/u);
  assert.match(css, /tbody tr\[data-selected\] \{\s*background-image: linear-gradient\(\s*var\(--sf-primary-container\),/u);
  assert.match(
    css,
    /tbody tr\[data-selected\]:hover \{\s*background-image: linear-gradient\(\s*var\(--sf-primary-container-hover\),/u,
    'a selected row still answers hover',
  );
  assert.match(
    css,
    /\.sf-table-scroll tbody \[data-sf-pinned\] \{\s*background-color: inherit;\s*background-image: inherit;/u,
    'a pinned cell takes both layers of its row, each painted once',
  );
});

test('the resize guide runs through the rows, in the colour of the table lines', async () => {
  const [element, template, css] = await Promise.all([
    read('src/smart/table/index.js'),
    read('src/smart/table/js/templates/default.js'),
    declarations(),
  ]);

  assert.match(template, /class="sf-table-resize-guide"/u, 'the guide is one element in the scroll area');
  assert.match(
    css,
    /\.sf-table-resize-guide \{[\s\S]*?inline-size: var\(--sf-px\);[\s\S]*?background-color: var\(--sf-outline-variant\);/u,
    'one pixel, in the colour of every other line in the table',
  );
  // A head cell cannot draw it — a pseudo-element of a `th` has no way into the
  // body, and the body's height is unknown to CSS — so it is placed in script,
  // from the bottom of the head for the height of the body.
  assert.match(
    element,
    /showColumnResizeGuide\(th\) \{[\s\S]*?head\.getBoundingClientRect\(\)[\s\S]*?body\.getBoundingClientRect\(\)/u,
    'the guide is placed between the head and the end of the body',
  );
  // Nothing in the guide's placement is rounded any more. Rounding to whole
  // pixels put the line beside the header's separator whenever the cell's edge
  // fell on a fraction, which a column width in rem or a root size of 87.5%
  // produces -- the consumer measured it as one pixel aside. The line is also
  // placed on the separator itself, which is the cell's own border, rather than
  // on the outer edge of the box.
  assert.match(
    element,
    /insetBlockStart = `\$\{headBox\.bottom - area\.top \+ scroll\.scrollTop\}px`/u,
    'it starts below the head, unrounded',
  );
  assert.match(
    element,
    /const border = parseFloat\(getComputedStyle\(th\)\.borderInlineEndWidth\) \|\| 0;/u,
    'and on the separator, which is the border',
  );
  assert.doesNotMatch(element, /insetInlineStart = `\$\{Math\.round/u, 'no rounding of the inline placement');
  assert.match(
    element,
    /blockSize = `\$\{bodyBox\.height\}px`/u,
    'and ends with the last row',
  );
  assert.match(element, /showColumnResizeGuide\(th\);[\s\S]*?outEvent/u, 'hovering the handle shows it');
  assert.match(
    element,
    /is-resizing-backward', delta < 0\);[\s\S]*?this\.showColumnResizeGuide\(th\);/u,
    'dragging keeps it on the edge',
  );
  assert.match(element, /clearColumnResizeClasses\(th\) \{[\s\S]*?hideColumnResizeGuide\(\);/u, 'releasing takes it away');
});

test('the head keeps a neutral separator on hover, not the colour of its text', async () => {
  const css = await declarations();

  assert.match(
    css,
    /th\.hover \{\s*border-inline-end-color: var\(--sf-outline\);/u,
    'a neutral line',
  );
  // `inherit` took the colour of the head text, which for a sorted column is the
  // primary role — the blue bar the request ruled out.
  assert.doesNotMatch(css, /th\.hover \{\s*border-inline-end-color: inherit/u);
});

test('the head paints its own surface, with a role behind the host property', async () => {
  const css = await declarations();

  assert.match(
    css,
    /sf-table > \.sf-table thead,\s*sf-table > \.sf-table thead th \{\s*background-color: var\(--sf-table-head--background-color, var\(--sf-surface-0\)\);/u,
    'the cells paint too, because a sticky th leaves the box thead paints',
  );
  // The bare property had no fallback, so the head was transparent and the rows
  // scrolled through its labels.
  assert.doesNotMatch(
    css,
    /background-color: var\(--sf-table-head--background-color\)/u,
    'the colour never rests on a property nothing defines',
  );
});

test('every colour role the table names is a role the theme declares', async () => {
  const [css, theme] = await Promise.all([
    declarations(),
    read('src/core/scss/_sf_css__theme.scss'),
  ]);
  // This is the mistake that made the head transparent for as long as it had a
  // background rule: `--sf-table-head--background-color` was the only value, and
  // nothing declares it, so the declaration was dropped. A role the theme does
  // not declare fails the same way, silently.
  const roles = new Set(
    [...css.matchAll(/var\(--sf-(surface|primary|outline|on-surface)[a-z0-9-]*\)/gu)].map((match) => match[0].slice(4, -1)),
  );
  const missing = [...roles].filter((role) => !theme.includes(`${role}:`));

  assert.deepEqual(missing, [], 'the table names only roles the theme declares');
  assert.ok(roles.size >= 6, 'the sweep actually found the roles');
});
