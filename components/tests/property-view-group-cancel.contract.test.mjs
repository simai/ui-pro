import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

// A group's cancel tells the host, as the whole-object cancel does: simai.main
// tracked unsaved work through the button's text because nothing was said when
// one group's edit was dropped (2026-10-27). The event is the same, with the
// group it was for; the whole-object cancel keeps its shape (no scope).
const source = readFileSync(new URL('../src/smart/property-view/index.js', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../src/smart/property-view/smart.manifest.json', import.meta.url), 'utf8'));

test('cancelling one group dispatches sf-property-view-cancel with scope group, section and group', () => {
  const body = source.slice(source.indexOf('    cancelEdit() {'), source.indexOf('// One press, one intent, one revision.'));
  assert.match(body, /const group = this\.editing;/u);
  assert.match(body, /if \(group\) \{\s*this\.dispatchEvent\(new CustomEvent\("sf-property-view-cancel", \{bubbles: true, composed: true, detail: \{mode: this\.mode, scope: "group", section: group\.section, group: group\.group\}\}\)\);/u);
  // The whole-object cancel is unchanged.
  assert.match(body, /if \(this\.openAll\) \{\s*this\.dispatchEvent\(new CustomEvent\("sf-property-view-cancel", \{bubbles: true, composed: true, detail: \{mode: this\.mode\}\}\)\);/u);
});

test('the manifest declares the group cancel payload', () => {
  const payload = manifest.events?.['sf-property-view-cancel']?.payload ?? manifest.contract?.events?.['sf-property-view-cancel']?.payload;
  const props = payload?.properties ?? JSON.stringify(manifest).includes('"scope"');
  assert.ok(props, 'sf-property-view-cancel payload is declared');
  assert.ok(JSON.stringify(manifest).includes('"group"') && JSON.stringify(manifest).includes('"scope"'));
});
