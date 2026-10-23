import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {URL} from 'node:url';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

// The four defects Larena reported in the data view table, each held where it
// was broken.

test('the resize handle is recognised by what it carries, not by a prefix of its id', async () => {
  const [element, template] = await Promise.all([
    read('src/smart/table/index.js'),
    read('src/smart/table/js/templates/default.js'),
  ]);

  assert.match(
    template,
    /data-sf-column-resizer=\$\{column\.key\}/u,
    'the handle carries the attribute the matcher looks for',
  );
  assert.match(
    element,
    /closest\('\[data-sf-column-resizer\]'\)/u,
    'the matcher reads that attribute',
  );
  // The id is built from the instance, so it never began with this prefix: a
  // pointerdown on the handle was not a resize and fell through to the move.
  assert.doesNotMatch(
    element,
    /id\^="column_resizer_"/u,
    'nothing matches the handle by an id prefix any more',
  );
  // Move and resize stay separate: a header is only a move target when the
  // pointer is not on the handle.
  assert.match(
    element,
    /canStart: \(event, th\) => !this\._columnResizeState && !this\.getColumnResizeHandle\(event\.target\)/u,
    'the move handler steps aside for the handle',
  );
});

test('show more adds to the list instead of replacing it, and does not repeat a record', async () => {
  const view = await read('src/smart/data-view/index.js');

  assert.match(
    view,
    /this\.continuing = reason === "show-more";/u,
    'the view remembers that the query in flight continues the list',
  );
  assert.match(
    view,
    /if \(this\.continuing && this\.records\.length\)/u,
    'a continuation keeps what is already shown',
  );
  assert.match(
    view,
    /const known = new Set\(this\.records\.map\(\(record\) => record\.id\)\);/u,
    'a record the port repeats is not added twice',
  );
  assert.match(view, /table\.addRows\?\.\(this\.appended\)/u, 'the table is appended to, not rebuilt');
});

// The checkbox state lives on the row, so appending is also what keeps the
// selection: the rows already on screen are not replaced. Nothing else is
// needed for it, which is why there is no separate selection-keeping code to
// point at — this case pins the reason.
test('a checked row survives show more because its state is on the row', async () => {
  const table = await read('src/smart/table/index.js');

  assert.match(
    table,
    /getSelectedRecordIds\(\)\s*\{\s*return this\.getTableData\(\)\.rows[\s\S]*?row\.select\?\.component\?\.props\?\.checked === true/u,
    'the selection is read from the rows themselves',
  );
  assert.match(
    table,
    /addRows\(rows = \[\], reason = "rows"\)[\s\S]*?\.\.\.currentRows,/u,
    'appending leaves the existing rows in place',
  );
});

test('the head can stick to the page, and does so by giving up the scroll container', async () => {
  const [element, template, styles] = await Promise.all([
    read('src/smart/table/index.js'),
    read('src/smart/table/js/templates/default.js'),
    read('src/smart/table/js/templates/default.css'),
  ]);

  assert.match(
    element,
    /verticalScroll: \{attribute: 'vertical-scroll', default: 'self', values: \['self', 'page'\]\}/u,
    'the axis is declared, and the page behaviour is the one a host opts into',
  );
  assert.match(
    template,
    /data-sf-vertical-scroll=\$\{context\.verticalScroll\}/u,
    'the scroll area says which mode it is in',
  );
  // Measured, not assumed: a sticky head binds to its nearest scroll container,
  // and `overflow-y: clip` does not help because the clip axis computes to
  // `hidden` and still makes one. Only releasing the container entirely works.
  // One scroll on a list page (owner, 2026-10-15): in page mode the area
  // scrolls sideways only and the table holds its head itself.
  assert.match(
    styles,
    /\.sf-table-scroll\[data-sf-vertical-scroll="page"\]\s*\{\s*overflow-x: auto;\s*overflow-y: hidden;/u,
    'page mode scrolls the area sideways only',
  );
  assert.match(element, /syncStickyHead\(\)/u, 'the table holds its head while the page scrolls');
  // The comment above the rule explains why the clip pairing was rejected, so
  // the guard reads declarations rather than prose.
  const declarations = styles.replace(/\/\*[\s\S]*?\*\//gu, '');
  assert.doesNotMatch(
    declarations,
    /overflow-y:\s*clip/u,
    'the clip pairing was measured and does not work',
  );
  assert.match(template, /<thead class="sticky top-0/u, 'the head is still sticky');
});

// The binding that caused the last defect looked right: `context.component.x`
// reads a prop off the element, and the element does not expose props — the
// template takes them from the context `getPropsContext` builds. It resolved to
// undefined, the attribute rendered empty, and the source contract above was
// green because it checked that a binding exists, not that it resolves. This is
// the general rule, so the next one fails here instead of on a page. The
// neighbouring session checked the rest of the templates read-only and found no
// other prop read; this keeps it that way.
test('no template reads a prop off the element instead of off the context', async () => {
  const {readdir} = await import('node:fs/promises');
  const offenders = [];
  const components = await readdir(new URL('src/smart/', root), {withFileTypes: true});

  for (const component of components) {
    if (!component.isDirectory()) continue;
    let templates = [];
    try {
      templates = await readdir(new URL(`src/smart/${component.name}/js/templates/`, root));
    } catch {
      continue;
    }
    for (const file of templates.filter((name) => name.endsWith('.js'))) {
      const path = `src/smart/${component.name}/js/templates/${file}`;
      const source = await read(path);
      for (const match of source.matchAll(/context\.component\.([A-Za-z_$][\w$]*)/gu)) {
        const name = match[1];
        // `refs` and `state` are objects the element does own.
        if (name === 'refs' || name === 'state') continue;
        // A call is fine, optional or not; so is a chain into an owned object.
        const after = source.slice(match.index + match[0].length);
        if (/^\s*(\(|\?\.\(|\.)/u.test(after)) continue;
        offenders.push(`${path}: context.component.${name} — props are read off the context`);
      }
    }
  }

  assert.deepEqual(offenders, [], 'a prop read off the element resolves to undefined and renders as an empty attribute');
});
