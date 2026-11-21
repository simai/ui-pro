import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

// A save over a revision that moved (simai.property-view-port 1.21.0: refused
// with reason revision_moved and the current revision, nothing written; 1.22.1:
// a host may answer conflict as well, with the same reason and revision). The
// card reads either as a conflict: it says the record changed, keeps what the
// person typed and reads the record again at its current revision -- on a group
// save and on a whole-record save alike.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const view = readFileSync(resolve(root, 'src/smart/view-properties/index.js'), 'utf8');
const body = (start) => {
  const at = view.indexOf(start);
  assert.ok(at >= 0, start);
  return view.slice(at, view.indexOf('\n    }\n', at));
};

test('a refusal revision_moved is read as a conflict before any save looks at it', () => {
  const raise = body('    async _raise(intent, payload, {stale = () => false} = {}) {');
  assert.match(raise, /if \(answer\.answer === "refused" && answer\.reason === "revision_moved"\) return \{\.\.\.answer, answer: "conflict"\};/u);
  // After the answer is checked as one of the four, so a stray reason on a
  // refusal of another kind stays a refusal.
  assert.ok(raise.indexOf('Host answer is not a declared port answer') < raise.indexOf('"revision_moved"'));
});

test('a group save and a whole-record save both keep what was typed and read again', () => {
  const group = body('    async saveGroup({confirm = null} = {}) {');
  const conflict = group.slice(group.indexOf('if (answer.answer === "conflict") {'), group.indexOf('if (answer.answer === "refused"'));
  assert.match(conflict, /this\.conflict = answer\.message \|\| this\.conflictText;/u);
  assert.match(conflict, /await this\._rereadAfterConflict\(answer\);/u);
  assert.doesNotMatch(conflict, /changed\.clear|_clearInputs/u);
  const all = body('    async saveAll({confirm = null} = {}) {');
  const allConflict = all.slice(all.indexOf('if (answer.answer === "conflict") {'), all.indexOf('if (answer.answer === "refused"'));
  assert.match(allConflict, /this\.conflict = answer\.message \|\| this\.conflictText;/u);
  assert.match(allConflict, /if \(!creating\) await this\._rereadAfterConflict\(answer\);/u);
  assert.doesNotMatch(allConflict, /changed\.clear|_clearInputs/u);
});

test('reading again takes the current revision and keeps the typed values', () => {
  const reread = body('    async _rereadAfterConflict(answer) {');
  assert.match(reread, /this\.record = \{\.\.\.this\.record, revision: answer\.revision\};/u);
  assert.match(reread, /this\._raise\("record\.load"/u);
  assert.doesNotMatch(reread, /changed\.clear|_clearInputs|inputDrafts/u);
});
