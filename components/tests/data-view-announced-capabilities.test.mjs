import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Port 1.10.0 (owner, 2026-10-13): creating a record and saving personal column
// settings are capabilities a host announces. A host on an earlier version was
// offered both without announcing them and keeps that; a host on 1.10.0 is
// offered only what it announces, and the table is told to draw nothing else.

const source = readFileSync(new URL('../src/smart/data-view/index.js', import.meta.url), 'utf8');
const rule = source.slice(source.indexOf('const BASELINE_UNTIL_1_10'), source.indexOf('const DATA_VIEW_TEXT'));
const method = source.slice(source.indexOf('    hostOffers(capability) {'), source.indexOf('    async _raise('));
const context = vm.createContext({});
vm.runInContext(`${rule}\nclass View { ${method} }\nthis.View = View;`, context);
const offers = (version, capabilities, capability) => {
  const view = new context.View();
  view.hostPort = {version, capabilities};
  return view.hostOffers(capability);
};

test('a host on an earlier port keeps create and column settings without announcing them', () => {
  for (const version of ['1.0.0', '1.8.0', '1.9.0']) {
    assert.equal(offers(version, ['row-actions'], 'create-record'), true, version);
    assert.equal(offers(version, ['row-actions'], 'personal-column-settings'), true, version);
    assert.equal(offers(version, ['row-actions'], 'saved-views'), false, 'other capabilities were never implied');
  }
});

test('a host on 1.10.0 is offered only what it announces', () => {
  assert.equal(offers('1.10.0', ['row-actions'], 'create-record'), false);
  assert.equal(offers('1.10.0', ['row-actions'], 'personal-column-settings'), false);
  assert.equal(offers('1.10.0', ['create-record'], 'create-record'), true);
  assert.equal(offers('1.10.0', ['personal-column-settings'], 'personal-column-settings'), true);
  assert.equal(offers('1.11.0', [], 'create-record'), false, 'a later version keeps the rule');
});

test('the intents are refused without the capability, and the table draws only what is offered', () => {
  assert.match(source, /"view\.create_record": "create-record", "settings\.save_personal": "personal-column-settings"/u);
  assert.match(source, /if \(capability && !this\.hostOffers\(capability\)\)/u);
  assert.match(source, /setAttribute\("creatable", this\.hostOffers\("create-record"\)/u);
  assert.match(source, /setAttribute\("settings-menu", this\.hostOffers\("personal-column-settings"\)/u);
  assert.match(source, /setAttribute\("filter-templates", this\.hostOffers\("saved-views"\)/u);
});
