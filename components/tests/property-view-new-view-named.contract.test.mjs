import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

// «Add a view» asks for the name before anything is written: simai.main QA
// (2026-10-27) found it made «New view» at once, a host record nobody had named.
const source = readFileSync(new URL('../src/smart/property-view/index.js', import.meta.url), 'utf8');
const template = readFileSync(new URL('../src/smart/property-view/js/templates/default.js', import.meta.url), 'utf8');

test('the add-a-view button opens the naming row and writes nothing', () => {
  const button = template.slice(template.indexOf('data-action="add-profile"'), template.indexOf('</section>', template.indexOf('data-action="add-profile"')));
  assert.match(button, /@click=\$\{\(\) => context\.component\.startNamingView\(\)\}/u);
  assert.doesNotMatch(button, /createViewProfile/u);
});

test('the naming row creates on confirm and leaves on Escape or close', () => {
  const row = template.slice(template.indexOf('function renderNewViewName('), template.indexOf('function renderArrangementAdditions('));
  assert.match(row, /context\.component\.createViewProfile\(input\?\.value \?\? ''\)/u);
  assert.match(row, /event\.key === 'Enter'\) commit\(event\)/u);
  assert.match(row, /event\.key === 'Escape'\) context\.component\.cancelNamingView\(\)/u);
  assert.match(row, /data-action="new-profile-cancel"[\s\S]*cancelNamingView\(\)/u);
});

test('an empty name makes nothing and keeps the row; a name makes the view and closes it', () => {
  const start = source.indexOf('    createViewProfile(label');
  const body = source.slice(start, source.indexOf('\n    }\n', start) + 7);
  const createViewProfile = new Function(`return function ${body.trim()}`)();
  const calls = [];
  const view = {
    namingView: true,
    layerDraft: {fields: {}},
    requestComponentUpdate() {},
    _viewProfileIntent(intent, payload) { calls.push([intent, payload]); return 'raised'; },
  };
  assert.equal(createViewProfile.call(view, '   '), null);
  assert.equal(view.namingView, true);
  assert.equal(calls.length, 0);
  assert.equal(createViewProfile.call(view, ' Договоры '), 'raised');
  assert.equal(view.namingView, false);
  assert.deepEqual(calls[0][0], 'view.create');
  assert.equal(calls[0][1].label, 'Договоры');
});
