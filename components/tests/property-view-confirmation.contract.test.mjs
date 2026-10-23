import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

// A save the host makes only once confirmed (port 1.14.0, the data view port's
// shape): refused with confirm_required and confirm {summary, digest}; the
// person reads the summary, and confirming raises the same save with the digest.
// Going back sends nothing and keeps every entry; a confirmation asked again is
// shown again.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const view = read('src/smart/property-view/index.js');
const template = read('src/smart/property-view/js/templates/default.js');
const body = (source, start) => {
  const at = source.indexOf(start);
  assert.ok(at >= 0, start);
  return source.slice(at, source.indexOf('\n    }\n', at));
};

test('the answers stay the four the standard names', () => {
  assert.match(view, /\["applied", "conflict", "refused", "unavailable"\]\.includes\(answer\.answer\)/u);
  const asked = body(view, '    _askedToConfirm(answer) {');
  assert.match(asked, /answer\?\.answer !== "refused" \|\| answer\.reason !== "confirm_required"/u);
  assert.match(asked, /typeof confirm\.digest !== "string"/u);
  assert.match(asked, /text: String\(confirm\.summary \|\| answer\.message \|\| ""\)/u);
});

test('both saves raise the digest again, and a create is never confirmed', () => {
  assert.match(body(view, '    async saveGroup({confirm = null} = {}) {'), /\.\.\.\(confirm \? \{confirm\} : \{\}\),\n\s+\}, \{stale/u);
  const all = body(view, '    async saveAll({confirm = null} = {}) {');
  assert.match(all, /: await this\._raise\("record\.save", \{[\s\S]*?\.\.\.\(confirm \? \{confirm\} : \{\}\),/u);
  assert.doesNotMatch(all.slice(all.indexOf('"record.create"'), all.indexOf('"record.save"')), /confirm/u);
  assert.match(all, /if \(!creating && this\._askedToConfirm\(answer\)\) return answer;/u);
  // Asked before the answer is read as a refusal with errors.
  const group = body(view, '    async saveGroup({confirm = null} = {}) {');
  assert.ok(group.indexOf('this._askedToConfirm(answer)') < group.indexOf('answer.answer === "refused"'));
  assert.match(body(view, '    confirmSave() {'), /this\.openAll \? this\.saveAll\(\{confirm: digest\}\) : this\.saveGroup\(\{confirm: digest\}\)/u);
});

test('going back keeps every entry', () => {
  const cancel = body(view, '    cancelConfirmation() {');
  assert.match(cancel, /this\.confirmation = null;/u);
  assert.doesNotMatch(cancel, /changed|_raise|inputDrafts/u);
});

test('the bar asks, in both bars, in both languages', () => {
  assert.match(template, /function renderOpenAllBar\(context\) \{\n\s+if \(context\.confirmation\) return renderConfirmation\(context\);/u);
  assert.match(template, /if \(context\.editing && context\.confirmation\) return renderConfirmation\(context\);/u);
  const bar = template.slice(template.indexOf('function renderConfirmation('), template.indexOf('function renderOpenAllBar('));
  assert.match(bar, /role="alert">\$\{context\.confirmation\.text\}/u);
  assert.match(bar, /data-action="confirm-save"[\s\S]*context\.component\.confirmSave\(\)/u);
  assert.match(bar, /data-action="keep-editing"[\s\S]*context\.component\.cancelConfirmation\(\)/u);
  for (const key of ['confirmSaveText', 'keepEditingText']) {
    assert.equal((view.match(new RegExp(`\\n        ${key}: "`, 'gu')) ?? []).length, 2, `${key} in en and ru`);
  }
});
