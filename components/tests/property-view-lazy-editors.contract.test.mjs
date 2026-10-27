import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

// Stand 24 P3 (standard 1.3.8 §7.2.1): opening a read-only record must not
// fetch every field editor. The relations only an edit, a press or an opened
// group draws are lazy; what a record shows when it is read stays eager.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SF = {RuleLoader: {}};
vm.runInNewContext(readFileSync(resolve(root, 'src/smart/property-view/rule.js'), 'utf8'), {SF});
const relations = new Map(SF.RuleLoader['cl-property-view'].relation.map((one) => [one.name, one.lazy === true]));

test('sf-property-view relates its editors lazily and its reading parts eagerly', () => {
  for (const name of ['cl-input', 'cl-textarea', 'cl-dropdown', 'cl-datepicker', 'cl-switch', 'cl-checkbox',
    'cl-button-group', 'cl-range-slider', 'cl-file-upload', 'cl-progress-bar', 'cl-sortable', 'cl-popover',
    'cl-profile-picker', 'cl-data-view', 'cl-table']) {
    assert.equal(relations.get(name), true, `${name} is lazy`);
  }
  for (const name of ['icons', 'cl-icon', 'cl-button', 'cl-drawer', 'cl-tabs', 'cl-badge', 'cl-tag', 'cl-reference-link',
    'cl-empty-state', 'cl-help-mark', 'cl-copy-button']) {
    assert.equal(relations.get(name), false, `${name} is fetched with the panel`);
  }
});
