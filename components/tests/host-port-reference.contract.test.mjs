import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createReferenceHost } from './fixtures/dataview-reference-host.mjs';

// The owner runs the kit on a reference host, so a break in the seam is found
// here and not by a product. A case the reference host cannot pass is a case
// the kit cannot ask of anyone else either.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const port = json('src/core/contracts/ports/simai.dataview-port/1.0.0/port.json');
const kitRoot = 'src/core/contracts/ports/simai.dataview-port/1.0.0/kit';
const kit = json(`${kitRoot}/manifest.json`);
const cases = kit.cases.map((id) => json(`${kitRoot}/cases/${id}.json`));
const nextKitRoot = 'src/core/contracts/ports/simai.dataview-port/1.1.0/kit';
const nextKit = json(`${nextKitRoot}/manifest.json`);
const twelveKitRoot = 'src/core/contracts/ports/simai.dataview-port/1.2.0/kit';
const twelveKit = json(`${twelveKitRoot}/manifest.json`);
const thirteenKitRoot = 'src/core/contracts/ports/simai.dataview-port/1.3.0/kit';
const thirteenKit = json(`${thirteenKitRoot}/manifest.json`);
const currentKitRoot = 'src/core/contracts/ports/simai.dataview-port/1.4.0/kit';
const currentKit = json(`${currentKitRoot}/manifest.json`);

const subset = (expected, actual, where) => {
  if (Array.isArray(expected)) return assert.deepEqual(actual, expected, where);
  if (expected && typeof expected === 'object') {
    for (const [key, value] of Object.entries(expected)) subset(value, actual?.[key], `${where}.${key}`);
    return undefined;
  }
  return assert.deepEqual(actual, expected, where);
};

for (const testCase of cases) {
  test(`reference host: ${testCase.id}`, () => {
    const host = createReferenceHost(testCase.given);
    const result = host.raise(testCase.when.intent, testCase.when.payload);
    assert.equal(result.answer, testCase.then.answer, `${testCase.id}: answer`);
    for (const field of testCase.then.answer_must_include ?? []) {
      assert.ok(field in result, `${testCase.id}: the answer carries ${field}`);
    }
    for (const key of testCase.then.data_must_include ?? []) {
      assert.ok(result.data && key in result.data, `${testCase.id}: the answer supplies ${key}`);
    }
    if (testCase.then.echo_must_equal) subset(testCase.then.echo_must_equal, result.data?.echo, `${testCase.id}: echo`);
    if (testCase.then.echo_must_include) subset(testCase.then.echo_must_include, result.data?.echo, `${testCase.id}: echo`);
  });
}

for (const [label, kitRootOfVersion, kitOfVersion] of [
  ['1.1.0', nextKitRoot, nextKit],
  ['1.2.0', twelveKitRoot, twelveKit],
  ['1.3.0', thirteenKitRoot, thirteenKit],
  ['1.4.0', currentKitRoot, currentKit],
]) {
  for (const id of kitOfVersion.cases) {
    test(`reference host ${label}: ${id}`, () => {
      const testCase = json(`${kitRootOfVersion}/cases/${id}.json`);
      const result = createReferenceHost(testCase.given).raise(testCase.when.intent, testCase.when.payload);
      assert.equal(result.answer, testCase.then.answer);
      for (const field of testCase.then.answer_must_include ?? []) assert.ok(field in result);
      for (const key of testCase.then.data_must_include ?? []) assert.ok(key in result.data);
    });
  }
}

test('the 18 original cases are byte-identical in the additive kit', () => {
  for (const id of kit.cases) {
    assert.deepEqual(
      readFileSync(resolve(root, `${kitRoot}/cases/${id}.json`)),
      readFileSync(resolve(root, `${nextKitRoot}/cases/${id}.json`)),
      id,
    );
  }
});

// A version is additive or it is not a version: 1.2.0 inherits every 1.1.0 case
// unchanged and adds its own. A host that passed 1.1.0 has nothing to redo but
// the new case.
test('1.2.0 carries the 1.1.0 cases unchanged and adds one', () => {
  for (const id of nextKit.cases) {
    assert.ok(twelveKit.cases.includes(id), `${id} is still asked of a host`);
    assert.deepEqual(
      readFileSync(resolve(root, `${nextKitRoot}/cases/${id}.json`)),
      readFileSync(resolve(root, `${twelveKitRoot}/cases/${id}.json`)),
      id,
    );
  }
  assert.deepEqual(
    twelveKit.cases.filter((id) => !nextKit.cases.includes(id)),
    ['columns-name-the-title-role'],
  );
});

test('1.3.0 carries the 1.2.0 cases unchanged and adds the count', () => {
  for (const id of twelveKit.cases) {
    assert.ok(thirteenKit.cases.includes(id), `${id} is still asked of a host`);
    assert.deepEqual(
      readFileSync(resolve(root, `${twelveKitRoot}/cases/${id}.json`)),
      readFileSync(resolve(root, `${thirteenKitRoot}/cases/${id}.json`)),
      id,
    );
  }
  assert.deepEqual(
    thirteenKit.cases.filter((id) => !twelveKit.cases.includes(id)),
    [
      'query-without-total-carries-has-next',
      'count-on-request-answers-the-number',
      'count-without-the-capability-is-not-offered',
    ],
  );
});

test('1.4.0 carries the 1.3.0 cases unchanged and adds personal pinning', () => {
  for (const id of thirteenKit.cases) {
    assert.ok(currentKit.cases.includes(id), `${id} is still asked of a host`);
    assert.deepEqual(
      readFileSync(resolve(root, `${thirteenKitRoot}/cases/${id}.json`)),
      readFileSync(resolve(root, `${currentKitRoot}/cases/${id}.json`)),
      id,
    );
  }
  assert.deepEqual(
    currentKit.cases.filter((id) => !thirteenKit.cases.includes(id)),
    ['settings-personal-carries-pinning'],
  );
});

// Pinning was writable only in the shared layer. The consumer's owner made it a
// person's own setting, so the version moved rather than the field quietly
// changing meaning inside a published one: a host on 1.3.0 is entitled to refuse
// a personal write that carries it.
test('1.4.0 makes pinning a personal field, and leaves the earlier versions alone', () => {
  const port = json('src/core/contracts/ports/simai.dataview-port/1.4.0/port.json');

  assert.deepEqual(port.settings.shared_only_fields, []);
  assert.deepEqual(port.settings.fields.personal, ['order', 'width', 'visible', 'pinned']);
  for (const version of ['1.1.0', '1.2.0', '1.3.0']) {
    const earlier = json(`src/core/contracts/ports/simai.dataview-port/${version}/port.json`);
    assert.deepEqual(earlier.settings.shared_only_fields, ['pinned'], `${version} keeps what it published`);
  }
});

// The number is a separate question, behind its own capability: a host that
// cannot count is never asked, and an answer that carries no total has to say
// whether there is more, or the view would be left deriving a page count from
// nothing.
test('1.3.0 lets an answer leave the total out, and asks for it separately', () => {
  const port = json('src/core/contracts/ports/simai.dataview-port/1.3.0/port.json');

  assert.equal(port.data.total.required, false);
  assert.deepEqual(port.data.total.schema.type, ['integer', 'null']);
  assert.equal(port.data.has_next.schema.type, 'boolean');
  assert.equal(port.intents['query.count'].capability, 'count-on-request');
  assert.equal(port.intents['query.count'].event, 'sf-count-request');
  assert.equal(port.intents['query.count'].carries_revision, false);
  assert.deepEqual(port.intents['query.count'].payload.properties.reason.enum, ['total', 'last-page', 'action-for-all']);
  assert.deepEqual(port.capabilities['count-on-request'].intents, ['query.count']);
  // The versions before it are left exactly as they were published.
  for (const version of ['1.1.0', '1.2.0']) {
    const earlier = json(`src/core/contracts/ports/simai.dataview-port/${version}/port.json`);
    assert.equal(earlier.data.total.required, true, `${version} still requires a total`);
    assert.equal(earlier.data.has_next, undefined, `${version} has no has_next`);
    assert.equal(earlier.intents['query.count'], undefined, `${version} has no count intent`);
  }
});

// The role is what the view pins by, so it has to be a property a host is
// allowed to send — on the columns of an answer and on the columns a saved view
// carries back, since both are closed schemas.
test('the title role is a declared column property on both column schemas', () => {
  const port12 = json('src/core/contracts/ports/simai.dataview-port/1.2.0/port.json');
  const columns = port12.data.columns.schema.items.properties;
  const viewColumns = port12.data.saved_views.schema.items.properties.layout.properties.columns.items.properties;
  assert.deepEqual(columns.role?.enum, ['title']);
  assert.deepEqual(viewColumns.role?.enum, ['title']);
  const port11 = json('src/core/contracts/ports/simai.dataview-port/1.1.0/port.json');
  assert.equal(port11.data.columns.schema.items.properties.role, undefined, '1.1.0 is left as it was published');
});

test('shared saved views have a separate capability and target', () => {
  const host = createReferenceHost({capabilities: ['saved-views', 'shared-saved-views']});
  assert.equal(host.raise('view.save_shared', {key: 'team', label: 'Team', target: 'shared'}).answer, 'applied');
  assert.equal(host.raise('view.save_shared', {key: 'team', target: 'personal'}).answer, 'refused');
});

test('a stale answer is dropped by its sequence', () => {
  const host = createReferenceHost({ records: [] });
  const older = host.raise('query.change', { sequence: 3, query: { page: 1, per_page: 25 } });
  const newer = host.raise('query.change', { sequence: 4, query: { page: 2, per_page: 25 } });
  assert.ok(newer.sequence > older.sequence, 'the host answers both and names the sequence');
  assert.equal(newer.data.echo.page, 2, 'the newest answer is the one the view keeps');
});

test('a batch with one stale revision writes nothing', () => {
  const host = createReferenceHost({
    records: [
      { id: 1, revision: 'r1', actions: ['archive'] },
      { id: 2, revision: 'r3', actions: ['archive'] },
    ],
  });
  const result = host.raise('bulk.apply_selected', {
    action_id: 'archive',
    record_ids: [1, 2],
    revisions: { 1: 'r1', 2: 'r2' },
  });
  assert.equal(result.answer, 'conflict');
  assert.deepEqual(result.conflicts, ['2']);
  assert.deepEqual(host.applied, [], 'record 1 is not archived either');
});

test('the reference host answers every intent the port declares', () => {
  const host = createReferenceHost({ records: [{ id: 1, revision: 'r1', actions: ['view'] }] });
  for (const [name, intent] of Object.entries(port.intents)) {
    const answer = host.raise(name, { record_ids: [1], action_id: 'view', key: 'missing', sequence: 1, query: {} });
    assert.notEqual(answer.reason, 'intent-unknown', `${name} (${intent.event}) is unknown to the reference host`);
  }
});
