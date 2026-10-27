import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {URL} from 'node:url';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const styles = async () => (await read('src/component/pagination/scss/_css__pagination.scss'))
  .replace(/\/\*[\s\S]*?\*\//gu, '');

test('the panel is there while rows are marked, and not there otherwise', async () => {
  const markup = await read('src/smart/pagination/js/templates/default.js');

  assert.match(
    markup,
    /\$\{context\.bottom && context\.showActions && context\.actions\?\.length && context\.selectedCount > 0/u,
    'nothing marked, no panel',
  );
  assert.match(markup, /role="region"\s*aria-label=\$\{context\.actionsRegionLabel\}/u);
  assert.match(
    markup,
    /sf-pagination-actions-count">\s*\$\{context\.selectedLabel\} \$\{context\.selectedCount\}/u,
    'the panel says how many are marked',
  );
});

test('the panel carries the four controls the owner asked for', async () => {
  const markup = await read('src/smart/pagination/js/templates/default.js');

  assert.match(markup, /placeholder=\$\{context\.actionChooseLabel\}/u, 'the list asks for an action');
  // And it opens on that choice rather than on the first real action: a select
  // that starts on an action makes Apply pressable before anyone has chosen,
  // and the first action is as likely to be "delete for ever" as anything else.
  assert.match(
    markup,
    /text: context\.actionChooseLabel,\s*value: "",\s*selected: !context\.action,/u,
    'the first option is not an action',
  );
  assert.match(
    markup,
    /text=\$\{context\.actionApplyText\}\s*\?disabled=\$\{!context\.action\}/u,
    'apply is out of reach until an action is chosen',
  );
  // It names the number when there is one. With the count unknown the label
  // stays bare until marking the box has asked for it.
  assert.match(
    markup,
    /label=\$\{context\.countKnown\s*\? `\$\{context\.actionForAllLabel\} \(\$\{context\.total\}\)`\s*: context\.actionForAllLabel\}/u,
    'for-all names how many it would touch',
  );
  assert.match(
    markup,
    /sf-pagination-actions-clear"[\s\S]*?icon="close"[\s\S]*?@click=\$\{\(\) => component\.clearSelection\(\)\}/u,
    'and the cross drops the selection',
  );
});

test('the cross announces the end of a selection it does not own', async () => {
  const [pagination, view] = await Promise.all([
    read('src/smart/pagination/index.js'),
    read('src/smart/data-view/index.js'),
  ]);

  // The rows hold the selection. A page row carrying the band says it is over
  // and the view passes the word to the table; the band in the card asks the
  // view directly. Neither keeps a copy that could drift from the boxes.
  assert.match(
    pagination,
    /clearSelection\(\) \{\s*this\.sfEmit\("selection-clear", \{/u,
  );
  assert.match(view, /"sf-pagination-apply",\s*"sf-pagination-load-more", "sf-pagination-selection-clear",/u, 'the view listens for it');
  assert.match(view, /"sf-table-retry", "sf-port-output", \.\.\.PAGINATION_EVENTS,/u, 'on connection');
  assert.match(
    view,
    /clearSelection\(\) \{\s*this\.table\?\.clearSelection\?\.\(\);/u,
  );
  assert.match(view, /if \(event\.type === "sf-pagination-selection-clear"\) return this\.clearSelection\(\);/u);
  assert.doesNotMatch(pagination, /_selectedIds|selectionSet/u, 'the pagination keeps no selection of its own');
});

test('every word in the panel is an attribute a host can translate', async () => {
  const [pagination, manifest] = await Promise.all([
    read('src/smart/pagination/index.js'),
    read('src/smart/pagination/smart.manifest.json'),
  ]);
  const declared = JSON.parse(manifest);

  for (const [attribute, accessor] of [
    ['action-choose-label', 'actionChooseLabel'],
    ['actions-region-label', 'actionsRegionLabel'],
    ['clear-selection-label', 'clearSelectionLabel'],
  ]) {
    assert.match(pagination, new RegExp(`attribute: "${attribute}"`, 'u'), `${attribute} is an attribute`);
    assert.ok(attribute in declared.inputs.properties, `${attribute} is declared in the manifest`);
    // This component builds its template context from `this.<name>`, so a
    // declared prop without a getter reaches the template as undefined — which
    // is how the first attempt shipped an empty placeholder.
    assert.match(
      pagination,
      new RegExp(`get ${accessor}\\(\\) \\{\\s*return[\\s\\S]*?getAttribute\\("${attribute}"\\)`, 'u'),
      `${accessor} is read through a getter`,
    );
  }
  assert.ok('sf-selection-clear' in declared.events, 'and the event is announced');
});

test('the band is the last strip of the card, and it is the card that places it', async () => {
  const [css, view] = await Promise.all([styles(), read('src/smart/data-view/index.js')]);

  // Three answers in three pairs. A panel floating at the bottom of the window
  // (2026-10-03) did not read as part of the table. Sticky inside the page row
  // (2026-10-04) made the whole row float over its own last rows, because a
  // sticky box cannot leave the box that contains it. So the card places the
  // band: the data view slots it into its own layout, which is what runs past
  // the bottom of the window, and only the band sticks.
  assert.match(css, /^\.sf-pagination-actions \{/mu, 'the band is not scoped to the page row any more');
  assert.doesNotMatch(css, /\.sf-pagination:has\(\.sf-pagination-actions\)/u, 'and the row itself does not stick');
  assert.match(css, /box-shadow: var\(--sf-elevation-2--shadow\);/u, 'a shadow upwards, over the rows');
  assert.match(
    css,
    /border-block-start: var\(--sf-px\) solid var\(--sf-pagination-actions--border-color\);/u,
    'and a line where the band starts',
  );
  assert.match(css, /--sf-pagination-actions--background-color: var\(--sf-elevation-2--surface\);/u, 'a role the theme declares: the band floats on step 2');
  assert.match(css, /inline-size: 100%;/u, 'the full width of the card');
  // Not the generic last row of the page: that class paints transparent at a
  // higher specificity, and the band came out see-through over the rows.
  const markup = await read('src/smart/pagination/js/templates/default.js');
  assert.doesNotMatch(markup, /"sf-pagination-bottom",\s*\n\s*"sf-pagination-actions"/u);

  assert.match(view, /<slot name="bulk"><\/slot>/u, 'the layout has a place for it');
  assert.match(
    view,
    /slot\[name="bulk"\]::slotted\(\*\) \{\s*position: sticky;\s*inset-block-end: 0;/u,
    'and the layout is what holds it at the bottom of the window',
  );
  // It lives in the light DOM because the Framework's styles do not cross a
  // shadow boundary, and the band is built from Framework components.
  assert.match(view, /this\._bulkBand\.setAttribute\("slot", "bulk"\)/u);
  // Written as an attribute: setState clears a false value by removing the
  // attribute, and a removed `bottom` means the default, which is to draw one.
  assert.match(view, /this\.pagination\?\.setAttribute\?\.\("bottom", "false"\)/u, 'so the page row stops drawing one');
});

test('nothing is chosen until someone chooses it', async () => {
  const pagination = await read('src/smart/pagination/index.js');

  // The getter used to fall through to the first enabled action, so Apply was
  // pressable the moment a row was marked — and a host's first action is as
  // likely to be "delete for ever" as anything else.
  assert.match(
    pagination,
    /get action\(\) \{[\s\S]*?return this\.actions\.find\(\(item\) => item\.selected && !item\.disabled\)\?\.value \|\| "";/u,
    'only an action the host marked, or none',
  );
  assert.doesNotMatch(
    pagination,
    /this\.actions\.find\(\(item\) => !item\.disabled\)\?\.value/u,
    'never simply the first one in the list',
  );
  // Choosing the entry at the top of the list has to be able to undo a choice.
  assert.match(
    pagination,
    /setAction\(action\) \{[\s\S]*?if \(value === previous\) \{\s*return this;/u,
    'an empty choice is a choice, not a no-op',
  );
  assert.match(pagination, /applyAction\(\) \{\s*if \(!this\.action\) \{\s*return this;/u, 'and apply refuses without one');
});
