import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {evaluateCondition, fieldConditions} from '../src/smart/property-view/js/conditions.js';

// Conditional fields (port 1.14.0, Larena 2026-10-23): `when` decides whether a
// field is shown, required and enabled, over the values on screen. A field its
// condition hides is not saved and not cleared -- hidden by a condition is not
// the same as emptied.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const values = (entries) => new Map(Object.entries(entries));

test('a leaf compares one field, by value and as text', () => {
  const on = values({type: 'framework', amount: 5, country: {value: 'RU', label: 'Россия'}, regions: [{value: 77, label: 'Москва'}], note: '', tags: []});
  assert.equal(evaluateCondition({field: 'type', op: 'eq', value: 'framework'}, on), true);
  assert.equal(evaluateCondition({field: 'type', op: 'ne', value: 'framework'}, on), false);
  assert.equal(evaluateCondition({field: 'amount', op: 'eq', value: '5'}, on), true, '5 and "5" are one value');
  assert.equal(evaluateCondition({field: 'country', op: 'eq', value: 'RU'}, on), true, 'a lookup by its value');
  assert.equal(evaluateCondition({field: 'country', op: 'eq', value: {value: 'RU', label: 'Россия'}}, on), true);
  assert.equal(evaluateCondition({field: 'regions', op: 'in', value: [78, 77]}, on), true, 'a list is in when any item is');
  assert.equal(evaluateCondition({field: 'regions', op: 'not_in', value: [78]}, on), true);
  assert.equal(evaluateCondition({field: 'regions', op: 'eq', value: 77}, on), true);
  for (const key of ['note', 'tags', 'absent']) {
    assert.equal(evaluateCondition({field: key, op: 'empty'}, on), true, `${key} is empty`);
    assert.equal(evaluateCondition({field: key, op: 'not_empty'}, on), false);
  }
  assert.equal(evaluateCondition({field: 'type', op: 'empty'}, on), false);
});

test('nodes combine, and a condition nobody can read decides nothing', () => {
  const on = values({type: 'framework', status: 'signed'});
  assert.equal(evaluateCondition({all: [{field: 'type', op: 'eq', value: 'framework'}, {field: 'status', op: 'in', value: ['signed']}]}, on), true);
  assert.equal(evaluateCondition({any: [{field: 'type', op: 'eq', value: 'single'}, {field: 'status', op: 'eq', value: 'signed'}]}, on), true);
  assert.equal(evaluateCondition({not: {field: 'type', op: 'eq', value: 'framework'}}, on), false);
  for (const unreadable of [null, [], {}, {field: 'type', op: 'like', value: 'f'}, {all: []}, {any: 'x'},
    {field: 'type', op: 'in', value: 'framework'}, {all: [{field: 'type', op: 'like'}]}, {not: {}}]) {
    assert.equal(evaluateCondition(unreadable, on), null, JSON.stringify(unreadable));
  }
});

test('a field is as declared where its conditions say nothing', () => {
  const on = values({type: 'single'});
  assert.deepEqual(fieldConditions({key: 'a'}, on), {visible: true, required: false, enabled: true});
  assert.deepEqual(fieldConditions({key: 'a', required: true}, on), {visible: true, required: true, enabled: true});
  assert.deepEqual(fieldConditions({key: 'a', required: true, when: {required: {field: 'type', op: 'eq', value: 'framework'}}}, on),
    {visible: true, required: false, enabled: true});
  assert.deepEqual(fieldConditions({key: 'a', when: {visible: {field: 'type', op: 'like'}, enabled: {field: 'type', op: 'eq', value: 'framework'}}}, on),
    {visible: true, required: false, enabled: false});
});

test('the component reads the values on screen, hides by condition only outside arranging, and does not save what it hides', () => {
  const view = read('src/smart/property-view/index.js');
  assert.match(view, /values\.set\(key, this\.changed\.has\(key\) \? this\.changed\.get\(key\) : field\.value\);/u);
  assert.match(view, /\.filter\(\(entry\) => !values \|\| !entry\.when \|\| fieldConditions\(entry, values\)\.visible\);/u);
  assert.match(view, /readonly: field\.readonly === true \|\| !decided\.enabled,/u);
  assert.match(view, /required: decided\.required,/u);
  // Left out of the save, never sent as empty: nothing writes null for it.
  assert.match(view, /_savedValues\(\) \{\n\s+const hidden = this\._hiddenByCondition\(\);\n\s+return Object\.fromEntries\(\[\.\.\.this\.changed\]\.filter\(\(\[key\]\) => !hidden\.has\(key\)\)\);/u);
  assert.doesNotMatch(view, /hidden\.has\(key\) \? null/u);
  const template = read('src/smart/property-view/js/templates/default.js');
  assert.match(template, /if \(!context\.configuring && field\.when\) field = context\.conditionedField\(field\);/u);
  // Arranging lists every entry, so a field hidden by its condition can still be placed.
  assert.match(template, /return context\.configuring \? \(entries \?\? \[\]\) : context\.visible\(entries\);/u);
});
