import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const STATES = ['running', 'waiting', 'done', 'stopped', 'failed'];

// sf-chat-threads 1.4.0: the run state of a conversation, as a compact sf-badge
// (smart.badge 1.2.0). UI Chat, control/RUN-STATUS-AND-ACTIVITY-DESIGN-2026-10-30.md.
test('a conversation declares activity with the badge\'s own words', () => {
  const component = read('src/smart/chat-threads/component.json');
  assert.match(component, /"activity": \{\s+"type": "enum",\s+"values": \["running", "waiting", "done", "stopped", "failed"\]/u);
  const manifest = read('src/smart/chat-threads/smart.manifest.json');
  assert.equal(manifest.match(/"activity": \{/gu).length, 4, 'every declaration of a thread carries it');
  const badge = JSON.parse(read('src/smart/badge/component.json'));
  for (const state of STATES) assert.ok(badge.settings.activity.values.includes(state), `the badge knows ${state}`);
});

// 2.0.0: the rows are sf-list's; the activity is the row's badge, its word and a tone.
test('the row draws the activity as a badge with its word, and nothing for a word it does not know', () => {
  const source = read('src/smart/chat-threads/index.js');
  assert.match(source, /const ACTIVITY_TONES = \{running: "neutral", waiting: "warning", done: "success", stopped: "neutral", failed: "error"\};/u);
  assert.match(source, /\.\.\.\(tone \? \{badge: \{text: this\.sfWord\(`activity-\$\{thread\.activity\}`\), tone\}\} : \{\}\)/u);
  for (const locale of ['ru', 'en']) {
    const own = JSON.parse(read(`src/smart/chat-threads/lang/${locale}.json`)).runtime;
    const badge = JSON.parse(read(`src/smart/badge/lang/${locale}.json`)).runtime;
    for (const state of STATES) assert.equal(own[`activity-${state}`], badge[`activity-${state}`], `${locale}: the badge's own word for ${state}`);
  }
});
