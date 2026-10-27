import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {URL} from 'node:url';
import {pagination, render} from './fixtures/pagination-harness.mjs';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const json = async (path) => JSON.parse(await read(path));

test('the mode is the host answer, not a setting', async () => {
  const view = await read('src/smart/data-view/index.js');

  // A total in the answer means there is a number; no total means there is a
  // link. Nothing configures this: a host that stops counting should not need
  // its view reconfigured as well.
  assert.match(
    view,
    /if \(Number\.isSafeInteger\(data\.total\) && data\.total >= 0\) \{\s*this\.total = data\.total;\s*this\.countKnown = true;\s*\} else if \(typeof data\.has_next === "boolean"\) \{/u,
  );
  assert.doesNotMatch(view, /count-mode|countMode/u, 'no mode input of its own');
});

test('without a count, has_next is the only thing that says there is more', async () => {
  // The pagination's own reading of the answer, not its source: a count
  // decides when there is one, has_next alone when there is none.
  assert.equal((await pagination({countKnown: false, current: 3, hasNext: true})).hasNext, true);
  assert.equal((await pagination({countKnown: false, current: 3})).hasNext, false, 'no has_next, no more');
  assert.equal((await pagination({countKnown: false, current: 3, total: 0, hasNext: true})).hasNext, true,
    'a total the host did not give does not stop the list');
  assert.equal((await pagination({total: 30, pageSize: 10, current: 3, hasNext: true})).hasNext, false,
    'an exact count is the answer when there is one');
  assert.equal((await pagination({total: 30, pageSize: 10, current: 2})).hasNext, true);
  // An estimate (total_exact false, gate 29) may be short of the truth, so
  // has_next still says there is more past it.
  assert.equal((await pagination({total: 30, totalExact: false, pageSize: 10, current: 3, hasNext: true})).hasNext, true);
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
  const view = await read('src/smart/data-view/index.js');
  const counts = (element) => element.events.filter((event) => event.name === 'count');

  const cannot = await pagination({countKnown: false});
  cannot.requestCount();
  assert.equal(counts(cannot).length, 0, 'no request without the capability');

  const can = await pagination({countKnown: false, canCount: true, current: 4, pageSize: 20});
  can.requestCount();
  assert.equal(can.counting, true, 'the wait is shown while the request is in flight');
  assert.deepEqual(counts(can).map((event) => event.detail), [{reason: 'total', current: 4, 'page-size': 20}]);
  can.requestCount();
  can.requestCount('last-page');
  assert.equal(counts(can).length, 1, 'no second request while one is in flight');

  const exact = await pagination({total: 450, canCount: true});
  exact.requestCount();
  assert.equal(counts(exact).length, 0, 'a number that is there is not asked for');

  // An estimate is a number nobody should act on: it can still be counted.
  const estimate = await pagination({total: 450, totalExact: false, canCount: true});
  estimate.requestCount();
  assert.equal(counts(estimate).length, 1, 'an estimate can be asked to become the number');
  assert.match(
    view,
    /canCount: Boolean\(this\.hostPort\?\.capabilities\?\.includes\("count-on-request"\)\)/u,
    'the capability decides whether the offer appears at all',
  );
});

test('the three answers to "how many" are rendered, and nothing else is', async () => {
  const markup = await read('src/smart/pagination/js/templates/default.js');
  const totalText = (rendered) => /<div class="sf-pagination-total flex items-cross-center">([\s\S]*?)<\/div>\s*<\/div>/u
    .exec(rendered.markup)?.[1] ?? '';

  // The number.
  const number = await render(await pagination({total: 450, canCount: true}));
  assert.match(totalText(number), /\{total-label\} 450\s/u, 'the number');
  assert.doesNotMatch(number.markup, /sf-pagination-count-request|<sf-spinner/u, 'and nothing to ask for');
  // A short wait.
  const waiting = await render(await pagination({countKnown: false, canCount: true, counting: true}));
  assert.match(totalText(waiting), /<sf-spinner size=1 aria-label=\{counting-label\}>/u, 'a short wait');
  assert.doesNotMatch(waiting.markup, /sf-pagination-count-request/u);
  // Or an offer to find out, which asks for the total.
  const offerElement = await pagination({countKnown: false, canCount: true});
  const offer = await render(offerElement);
  assert.match(totalText(offer), /class="sf-pagination-count-request"[\s\S]*?text=\{show-count-label\}/u, 'or an offer to find out');
  offer.press(/class="sf-pagination-count-request"/u);
  assert.deepEqual(offerElement.events.map((event) => [event.name, event.detail.reason]), [['count', 'total']]);
  // A host that cannot count is offered nothing: a link that answers
  // "unavailable" is worse than no link.
  const cannot = await render(await pagination({countKnown: false}));
  assert.equal(totalText(cannot).trim(), '', 'no number, no wait, no link');
  // An estimate (gate 29) reads «~N», with the offer beside it.
  const estimate = await render(await pagination({total: 450, totalExact: false, canCount: true}));
  assert.match(totalText(estimate), /\{total-label\} ~450\s[\s\S]*class="sf-pagination-count-request"/u);
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
  const view = await read('src/smart/data-view/index.js');

  const unknown = await pagination({countKnown: false, canCount: true, current: 2});
  unknown.lastPage();
  assert.deepEqual(unknown.events.map((event) => [event.name, event.detail.reason]), [['count', 'last-page']],
    'the count is asked for, and no page is reported');
  assert.equal(unknown.current, 2);
  assert.match(view, /if \(reason === "last-page"\) this\.pagination\?\.lastPage\?\.\(\);/u, 'and the jump follows the answer');
  // Once the number is there the jump is a page like any other.
  const counted = await pagination({total: 95, pageSize: 10, current: 2});
  counted.lastPage();
  assert.equal(counted.current, 10);
  assert.deepEqual(counted.events.map((event) => [event.name, event.detail.current]), [['change', 10]]);
  // Clamping to a page count derived from nothing would be worse than letting
  // the host answer an exhausted page with no records.
  const unclamped = await pagination({countKnown: false, current: 2});
  assert.deepEqual(unclamped.goToPage(7), {outcome: 'applied'});
  assert.equal(unclamped.current, 7, 'without a count no page is clamped');
  const clamped = await pagination({total: 30, pageSize: 10, current: 1});
  clamped.goToPage(7);
  assert.equal(clamped.current, 3, 'with an exact count the last page is the limit');
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
  // The marked count was capped by the total. With no total that cap is zero,
  // so a marked row read as none and the panel of bulk controls never appeared.
  // The built bytes are what showed it.
  assert.equal((await pagination({countKnown: false, total: 0, selectedCount: 3})).selectedCount, 3);
  assert.equal((await pagination({total: 2, selectedCount: 3})).selectedCount, 2, 'an exact total still caps it');
  assert.equal((await pagination({total: 2, totalExact: false, selectedCount: 3})).selectedCount, 3,
    'an estimate does not');
  const panel = await render(await pagination({countKnown: false, total: 0, selectedCount: 3, actions: 'archive:Archive'}));
  assert.match(panel.markup, /<span class="sf-pagination-actions-count">\s*\{selected-label\} 3\s*<\/span>/u,
    'and the panel is there');
});

test('nothing is clamped by a count that does not exist', async () => {
  const source = await read('src/smart/pagination/index.js');

  // Three clamps read the total, and with no total each one quietly broke the
  // mode: the marked count became zero, the page was pinned to the first, and a
  // page count of one was reported to the host as fact. Each is now conditional,
  // and the page count is said out loud as unknown.
  const unknown = await pagination({countKnown: false, total: 0, current: 3, hasNext: true});
  assert.equal(unknown.current, 3, 'the page being read is not pinned to the first');
  assert.equal(unknown.knownPageCount, null);
  assert.equal((await pagination({total: 30, pageSize: 10, current: 9})).current, 3, 'an exact count still holds it');
  assert.equal((await pagination({total: 30, totalExact: false, pageSize: 10, current: 9})).current, 9,
    'an estimate does not');
  assert.equal((await pagination({total: 30, totalExact: false})).knownPageCount, null, 'nor gives a page count');

  // No event tells a host there is one page.
  unknown.goToPage(4);
  unknown.showMore();
  unknown.setPageSize(50);
  assert.deepEqual(unknown.events.map((event) => [event.name, event.detail['page-count']]),
    [['change', null], ['load-more', null], ['size-change', null]]);
  assert.equal(unknown.current, 4, 'and a new page size keeps the page being read');
  assert.doesNotMatch(source, /pageCount: this\.pageCount,/u, 'no template context names a page count it does not have');
});
