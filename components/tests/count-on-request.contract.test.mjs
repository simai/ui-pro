import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {URL} from 'node:url';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const json = async (path) => JSON.parse(await read(path));

test('the mode is the host answer, not a setting', async () => {
  const [view, pagination] = await Promise.all([
    read('src/smart/data-view/index.js'),
    read('src/smart/pagination/index.js'),
  ]);

  // A total in the answer means there is a number; no total means there is a
  // link. Nothing configures this: a host that stops counting should not need
  // its view reconfigured as well.
  assert.match(
    view,
    /if \(Number\.isSafeInteger\(data\.total\) && data\.total >= 0\) \{\s*this\.total = data\.total;\s*this\.countKnown = true;\s*\} else if \(typeof data\.has_next === "boolean"\) \{/u,
  );
  assert.doesNotMatch(view, /count-mode|countMode/u, 'no mode input of its own');
  assert.match(
    pagination,
    /get hasNext\(\) \{\s*return this\.countKnown \? this\.current < this\.pageCount : this\.hasNextPage;/u,
    'without a count, has_next is the only thing that says there is more',
  );
});

test('a number that has been answered stays until the query changes', async () => {
  const view = await read('src/smart/data-view/index.js');

  assert.match(
    view,
    /_countKey\(\) \{\s*return JSON\.stringify\(\[this\.query\.search \?\? "", this\.query\.filters \?\? \{\}, this\.query\.per_page \?\? 25\]\);/u,
    'search, filters and page size change what the number would be; a page does not',
  );
  assert.match(
    view,
    /this\.countKnown = this\.countedQuery !== null && this\.countedQuery === this\._countKey\(\);/u,
    'so paging and Show more keep the number on screen',
  );
  // A count that arrives after the query has moved on belongs to nothing.
  assert.match(
    view,
    /if \(requested !== this\._countKey\(\)\) \{\s*this\.pagination\?\.setState\?\.\(\{counting: false\}\);/u,
  );
});

test('the number is asked for only when a host can answer, and only once at a time', async () => {
  const [view, pagination] = await Promise.all([
    read('src/smart/data-view/index.js'),
    read('src/smart/pagination/index.js'),
  ]);

  assert.match(
    pagination,
    /requestCount\(reason = "total"\) \{\s*if \(this\.countKnown \|\| !this\.canCount \|\| this\.counting\) \{\s*return this;/u,
    'no link without the capability, and no second request while one is in flight',
  );
  assert.match(pagination, /this\.setState\(\{ counting: true \}\);\s*this\.sfEmit\("count"/u);
  assert.match(
    view,
    /canCount: Boolean\(this\.hostPort\?\.capabilities\?\.includes\("count-on-request"\)\)/u,
    'the capability decides whether the offer appears at all',
  );
});

test('the three answers to "how many" are rendered, and nothing else is', async () => {
  const markup = await read('src/smart/pagination/js/templates/default.js');

  assert.match(markup, /\$\{context\.countKnown\s*\? html`[\s\S]*?\$\{context\.totalLabel\} \$\{context\.total\}/u, 'the number');
  assert.match(markup, /context\.counting[\s\S]*?<sf-spinner size=\$\{context\.size\} aria-label=\$\{context\.countingLabel\}/u, 'a short wait');
  assert.match(
    markup,
    /context\.canCount[\s\S]*?class="sf-pagination-count-request"[\s\S]*?text=\$\{context\.showCountLabel\}[\s\S]*?@click=\$\{\(\) => component\.requestCount\("total"\)\}/u,
    'or an offer to find out',
  );
  // A host that cannot count is offered nothing: a link that answers
  // "unavailable" is worse than no link.
  assert.match(markup, /: ""\s*\}\s*<\/div>/u);
  // The marked count left the footer in round four: the band of bulk controls
  // says how many are marked, and only while something is. Saying it twice gave
  // a footer that read «Отмечено: 0/450» at rest and «0/0» before the first
  // answer. What a count that is not known must not do -- invent a denominator
  // -- is now checked where that count lives, on the band.
  assert.doesNotMatch(markup, /sf-pagination-marked/u);
  const view = await read('src/smart/data-view/index.js');
  assert.match(
    view,
    /const total = pagination\.countKnown === false \? null : pagination\.total;/u,
    'the band takes no denominator from a count nobody has',
  );
});

test('the last page is asked for, because nobody has its number yet', async () => {
  const [pagination, view] = await Promise.all([
    read('src/smart/pagination/index.js'),
    read('src/smart/data-view/index.js'),
  ]);

  assert.match(
    pagination,
    /lastPage\(\) \{\s*if \(!this\.countKnown\) \{\s*return this\.requestCount\("last-page"\);/u,
  );
  assert.match(view, /if \(reason === "last-page"\) this\.pagination\?\.lastPage\?\.\(\);/u, 'and the jump follows the answer');
  // Clamping to a page count derived from nothing would be worse than letting
  // the host answer an exhausted page with no records.
  assert.match(
    pagination,
    /const next = this\.countKnown\s*\? Math\.min\(Math\.max\(parsed, 1\), this\.pageCount\)\s*: Math\.max\(parsed, 1\);/u,
  );
});

test('for-all asks for the number it will be applied against', async () => {
  const [pagination, view] = await Promise.all([
    read('src/smart/pagination/index.js'),
    read('src/smart/data-view/index.js'),
  ]);

  assert.match(pagination, /if \(next\) \{\s*this\.requestCount\("action-for-all"\);/u, 'marking the box asks for the count');
  assert.doesNotMatch(pagination, /if \(next\) \{\s*this\.applyAction/u, 'marking the box never applies the action');
  // A ticked for-all over a number nobody has is a promise the view cannot
  // keep, so a refusal puts the box back.
  assert.match(
    view,
    /if \(reason === "action-for-all"\) this\.pagination\?\.setState\?\.\(\{actionForAll: false\}\);/u,
  );
  assert.match(view, /applyUnderFilter\(actionId, confirmedTotal\)/u, 'and apply still names a confirmed total');
});

test('the count port is additive, and the versions before it are untouched', async () => {
  const [port, kit, manifest] = await Promise.all([
    json('src/core/contracts/ports/simai.dataview-port/1.3.0/port.json'),
    json('src/core/contracts/ports/simai.dataview-port/1.3.0/kit/manifest.json'),
    json('src/smart/data-view/smart.manifest.json'),
  ]);
  const declared = manifest.composition.declarative.host_port;

  assert.equal(port.version, '1.3.0');
  assert.equal(kit.version, '1.3.0');
  assert.equal(port.conformance.cases, kit.cases.length);
  // The composite has moved on: 1.4.0 made pinning a personal column setting,
  // 1.5.0 lets a write be answered with the record it changed and a saved view
  // remember its filter fields, 1.6.0 adds opening the whole list from a capped
  // one, 1.7.0 lets a column say what it holds, 1.8.0 lets the list be a
  // tree, 1.9.0 lets a node name its icon, and 1.10.0 makes create and column
  // settings capabilities a host announces. 1.3.0 keeps the count as it
  // was published.
  assert.equal(declared.version, '1.12.0');
  assert.deepEqual(declared.supported_versions, ['1.0.0', '1.1.0', '1.2.0', '1.3.0', '1.4.0', '1.5.0', '1.6.0', '1.7.0', '1.8.0', '1.9.0', '1.10.0', '1.11.0', '1.12.0']);
  assert.ok(manifest.events['sf-count-request'], 'the composite announces the event the intent is raised by');
  const earlier = await json('src/core/contracts/ports/simai.dataview-port/1.2.0/port.json');
  assert.equal(earlier.version, '1.2.0', 'the published version keeps its number');
  assert.equal(earlier.conformance.cases, 20);
});

test('the pagination declares every new word and the element it now renders', async () => {
  const [manifest, rule] = await Promise.all([
    json('src/smart/pagination/smart.manifest.json'),
    read('src/smart/pagination/rule.js'),
  ]);

  for (const attribute of ['count-known', 'can-count', 'counting', 'has-next', 'show-count-label', 'counting-label']) {
    assert.ok(attribute in manifest.inputs.properties, `${attribute} is declared`);
  }
  assert.ok(manifest.events['sf-count-request'], 'and the event it raises');
  // The short wait is a Framework element, so the rule has to fetch it or a
  // page that only ever waits would render nothing.
  assert.match(rule, /\{ name: 'cl-spinner' \}/u);
  assert.ok(manifest.composition.uses.includes('smart.spinner'));
});

test('a marked row still counts when the total does not', async () => {
  const pagination = await read('src/smart/pagination/index.js');

  // The marked count was capped by the total. With no total that cap is zero,
  // so a marked row read as none and the panel of bulk controls never appeared.
  // The built bytes are what showed it.
  assert.match(
    pagination,
    /return this\.countKnown \? Math\.min\(atLeastNone, this\.total\) : atLeastNone;/u,
  );
});

test('nothing is clamped by a count that does not exist', async () => {
  const pagination = await read('src/smart/pagination/index.js');

  // Three clamps read the total, and with no total each one quietly broke the
  // mode: the marked count became zero, the page was pinned to the first, and a
  // page count of one was reported to the host as fact. Each is now conditional,
  // and the page count is said out loud as unknown.
  assert.match(
    pagination,
    /return this\.countKnown \? Math\.min\(atLeastFirst, this\.pageCount\) : atLeastFirst;/u,
    'the page being read is not pinned to the first',
  );
  assert.match(
    pagination,
    /get knownPageCount\(\) \{\s*return this\.countKnown \? this\.pageCount : null;/u,
  );
  assert.doesNotMatch(pagination, /pageCount: this\.pageCount,/u, 'no event tells a host there is one page');
});
