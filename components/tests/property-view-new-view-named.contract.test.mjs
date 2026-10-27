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

// Cancelling an arrangement nobody changed writes nothing (simai.main QA,
// 2026-10-28): an identical view.save still cost a shared revision.
test('cancelling configure skips view.save when the layer is the one entered with', () => {
  const body = source.slice(source.indexOf('    async cancelConfiguringView() {'), source.indexOf('    askReset() {'));
  assert.match(body, /const untouched = entered\.revision != null && this\._layerRevision\(entered\.kind\) === entered\.revision;/u);
  const early = body.slice(body.indexOf('if (untouched'), body.indexOf('this.layerDraft = copy(entered.view);'));
  assert.doesNotMatch(early, /saveView/u);
  assert.match(source, /revision: this\._layerRevision\(this\.viewTarget\),/u);
});

// A link inside a field's value does its own thing only (simai.main,
// 2026-10-28): downloading a stored file also opened the group for editing.
test('a press on a link inside a value does not open the group', () => {
  const start = template.indexOf('data-open-group=${groupKey}');
  const handler = template.slice(start, template.indexOf('renderFieldValue(context, field, editing)}', start));
  assert.match(handler, /if \(event\.composedPath\(\)\.some\(\(node\) => node\.matches\?\.\('a\[href\]'\)\)\) return;\s*context\.component\.editGroup\(sectionKey, groupKey\);/u);
});

// Entering and leaving the arrangement keeps the keyboard somewhere
// (simai.main keyboard QA, 2026-10-28).
test('arranging moves the focus to its bar, and Done back to the menu', () => {
  const start = source.slice(source.indexOf('    startConfiguringView() {'), source.indexOf('    stopConfiguringView() {'));
  assert.match(start, /this\._focusAfterRender\("\.sf-property-view-configure-bar"\);\s*return true;/u);
  const stop = source.slice(source.indexOf('    stopConfiguringView() {'), source.indexOf('    _focusAfterRender(selector) {'));
  assert.match(stop, /if \(wasConfiguring\) this\._focusAfterRender\('\[data-action="menu"\]'\);/u);
  assert.match(source, /if \(active && active !== document\.body && root\?\.contains\?\.\(active\)\) return;/u);
});
