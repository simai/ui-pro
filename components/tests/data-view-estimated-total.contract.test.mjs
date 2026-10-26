import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {URL} from 'node:url';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

// Standard simai.smart-component gate 29: a shown total reads «~N» while the
// host says it is an estimate (Larena Backend, msg-4c2483e3).
test('an estimated total is shown as ~N and is never confirmed', async () => {
  const view = await read('src/smart/data-view/index.js');

  assert.match(view, /if \(Number\.isSafeInteger\(data\.total\)\) this\.totalExact = data\.total_exact !== false;/u,
    'the answer says whether the number is exact; no flag means exact');
  assert.match(view, /_shownTotal\(total\) \{\s*return this\.totalExact \? String\(total\) : `~\$\{total\}`;/u);
  assert.match(view, /\.replace\("\{total\}", this\._shownTotal\(this\.total\)\)/u, '«N of ~M» in the show-all band');
  assert.match(view, /\$\{pagination\.actionForAllLabel\} \(\$\{this\._shownTotal\(total\)\}\)/u, 'the for-all label');
  assert.match(view, /totalExact: this\.totalExact, hasNext: this\.hasNext/u, 'the page row is told too');
  assert.match(view, /applyUnderFilter\(actionId, confirmedTotal\) \{\s*\/\/[^\n]*\n\s*if \(!this\.totalExact\) \{\s*return this\.count\("action-for-all"\)/u,
    'an action under the filter counts first when the number is an estimate');
  assert.match(view, /this\.totalExact = answer\.data\.total_exact !== false;/u, 'a count answer settles it');
});
