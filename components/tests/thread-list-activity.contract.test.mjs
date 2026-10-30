import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const STATES = ['running', 'waiting', 'done', 'stopped', 'failed'];

// sf-thread-list 1.4.0: the run state of a conversation, as a compact sf-badge
// (smart.badge 1.2.0). UI Chat, control/RUN-STATUS-AND-ACTIVITY-DESIGN-2026-10-30.md.
test('a conversation declares activity with the badge\'s own words', () => {
  const component = read('src/smart/thread-list/component.json');
  assert.match(component, /"activity": \{\s+"type": "enum",\s+"values": \["running", "waiting", "done", "stopped", "failed"\]/u);
  const manifest = read('src/smart/thread-list/smart.manifest.json');
  assert.equal(manifest.match(/"activity": \{/gu).length, 4, 'every declaration of a thread carries it');
  const badge = JSON.parse(read('src/smart/badge/component.json'));
  for (const state of STATES) assert.ok(badge.settings.activity.values.includes(state), `the badge knows ${state}`);
});

test('the row draws the compact mark, and nothing for a word the badge does not know', () => {
  const template = read('src/smart/thread-list/js/templates/default.js');
  assert.match(template, /const ACTIVITIES = new Set\(\["running", "waiting", "done", "stopped", "failed"\]\);/u);
  assert.match(template, /ACTIVITIES\.has\(thread\.activity\) \? thread\.activity : ""/u);
  assert.match(template, /<sf-badge class="sf-thread-list__activity" size="1\/3" appearance="tonal" compact\s+activity=\$\{activity\}>/u);
});
