// sf-message-log 2.0.0 is a dated alias of SIMAI Framework's sf-list-feed until
// 2027-01-01 (sets split plan 2026-11-05 §3 S2; duplication audit 2026-11-03
// A-6). The feed's behaviour is the Framework's and its probes are there; this
// holds what the package still owns: that the element is the feed's heir and
// carries none of its code, the former names and their dates, the former public
// variables feeding the feed's, and that the folder (pinned in pro.package.json)
// names one component. Its behaviour under the former names is held by the
// browser probes tests/browser/message-log.browser.mjs and
// message-log-stream.browser.mjs.
//
// It runs in the overlay (ui-source at the pinned revision with this
// repository laid over it), so the feed's own folder is beside it.
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const json = (path) => JSON.parse(read(path));
const folder = 'src/smart/message-log';
const evaluateRule = (text) => {
  const sandbox = {SF: {RuleLoader: {}}};
  vm.runInContext(text, vm.createContext(sandbox));
  return JSON.parse(JSON.stringify(sandbox.SF.RuleLoader));
};
const code = (path) => read(path)
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .replace(/(^|[^:"'`\\])\/\/.*$/gmu, '$1');

const SINCE = '2026-11-05';
const UNTIL = '2027-01-01';
const VERBS = ['load-more', 'begun', 'chunk', 'completed', 'failed', 'cancelled'];

test('the element is the heir of sf-list-feed and carries none of its code', () => {
  const source = code(`${folder}/index.js`);
  assert.match(source, /class SfMessageLog extends Feed/u);
  assert.match(source, /whenDefined\(TO\)/u);
  assert.match(source, /const TO = "sf-list-feed"/u);
  assert.match(source, /registry\.define\(TAG, SfMessageLog\)/u);
  assert.match(source, /"sfTagAliasOf", \{value: TO\}/u);
  assert.match(source, /noteTagAlias\(ROW\)/u);
  assert.match(source, /registerTagAliasRows\(\[ROW\]\)/u);
  for (const [, spec] of read(`${folder}/index.js`).matchAll(/from\s+["']([^"']+)["']|import\s+["']([^"']+)["']/gu)) {
    if (!spec) continue;
    assert.ok(spec.startsWith('../../core/js/') || spec.startsWith('./'), `index.js imports ${spec}`);
    assert.doesNotMatch(spec, /list-feed/u, 'the bundle carries the feed');
  }
  // Nothing of 1.x is left: the template is the feed's.
  assert.ok(!existsSync(resolve(root, `${folder}/js/templates/default.js`)), 'the 1.x template is gone');
  assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|\bfetch\(|XMLHttpRequest/u);
  assert.doesNotMatch(source, /new CustomEvent\(/u, 'the feed sends the events; the former names follow by the table');
});

test('the former properties and methods are answered under the feed\'s names', () => {
  const source = code(`${folder}/index.js`);
  for (const [from, to] of [['messages', 'items'], ['renderMessage', 'renderItem'], ['announceMessage', 'announceItem']]) {
    assert.match(source, new RegExp(`set ${from}\\(value\\) \\{\\s*former\\("[a-z]+", "${from}", "${to}"\\)`, 'u'), `${from} → ${to}`);
  }
  assert.match(source, /setMessages\(messages = \[\], options = \{\}\) \{\s*former\("action", "setMessages", "setItems"\);\s*return this\.setItems\(entriesOf\(messages\), options\)/u);
  assert.match(source, /prependMessages\(messages = \[\], options = \{\}\) \{\s*former\("action", "prependMessages", "prependItems"\);\s*return this\.prependItems\(entriesOf\(messages\), options\)/u);
  // 1.x's own methods the feed does not keep (sf-chat-window 1.12 called setHasMore).
  assert.match(source, /setHasMore\(value\) \{\s*former\("action", "setHasMore", "has-more"\);\s*this\.hasMore = Boolean\(value\)/u);
  assert.match(source, /isNearBottom\(\) \{\s*former\("action", "isNearBottom", "isAtLatest"\);\s*return this\.isAtLatest\(\)/u);
  // A server's 1.x island {"messages": [...]} is read as the feed's items.
  assert.match(source, /sfReadIsland\(\) \{[\s\S]*?"messages" in data[\s\S]*?items: entriesOf\(messages\)[\s\S]*?return super\.sfReadIsland\?\.\(\);/u);
  // remove(id) is 1.0's detach; remove() stays the browser's.
  assert.match(source, /if \(!args\.length\) return super\.remove\(\)/u);
  // The 1.0 entry fields keep their earlier dates.
  assert.match(source, /legacy\("entry-field", "pending", "growing"\)/u);
  assert.match(source, /legacy\("entry-field", "author_name", "author-name"\)/u);
  assert.match(source, /const SINCE = "2026-11-05";\s*const REMOVE_AFTER = "2027-01-01"/u);
});

test('every event of the feed goes out under its former name, dated, with one cancel', () => {
  const rows = json(`${folder}/aliases.json`).aliases;
  const feed = json('src/smart/list-feed/component.json');
  assert.deepEqual(Object.keys(feed.events).sort(), [...VERBS].sort(), 'the feed sends these verbs');
  for (const verb of VERBS) {
    const row = rows.find((one) => one.kind === 'event' && one.from === `sf-message-log-${verb}`);
    assert.ok(row, `sf-message-log-${verb} has a row`);
    assert.equal(row.to, `sf-list-feed-${verb}`);
    assert.equal(row.mode, 'same-detail');
    assert.equal(row.since, SINCE);
    assert.equal(row.remove_after, UNTIL);
    assert.equal(Boolean(row.cancelable), Boolean(feed.events[verb].cancelable), `${verb}: cancelable as the feed's`);
  }
  const earlier = rows.find((one) => one.from === 'sf-message-log-load-earlier');
  assert.deepEqual([earlier.to, earlier.since, earlier.remove_after], ['sf-list-feed-load-more', '2026-10-27', '2026-12-01']);
  const remove = rows.find((one) => one.from === 'remove');
  assert.deepEqual([remove.to, remove.mode], ['detach', 'component']);
  assert.ok(rows.every((row) => row.component === 'sf-message-log'));
});

test('the rule relates the feed, and the folder names one component', () => {
  const rules = evaluateRule(read(`${folder}/rule.js`));
  assert.deepEqual(Object.keys(rules), ['cl-message-log']);
  assert.deepEqual(rules['cl-message-log'].tags, ['sf-message-log']);
  assert.deepEqual(rules['cl-message-log'].relation, [{name: 'cl-list-feed'}]);
  assert.equal(rules['cl-message-log'].css, true);
  const manifest = json(`${folder}/smart.manifest.json`);
  const contract = json(`${folder}/component.json`);
  assert.equal(manifest.id, 'smart.message-log');
  assert.equal(manifest.custom_element, 'sf-message-log');
  assert.deepEqual(manifest.composition.uses, ['smart.list-feed']);
  assert.equal(contract.tag, 'sf-message-log');
  assert.equal(contract.version, '2.0.1');
  assert.equal(manifest.version, contract.version);
  assert.equal(contract.templates, undefined, 'no template of its own');
  assert.equal(manifest.ownership.source, 'simai/ui-pro');
  const paths = manifest.provenance.source_artifacts.map((artifact) => artifact.path).sort();
  assert.deepEqual(paths, ['index.js', 'js/templates/default.css', 'rule.js', 'docs.md', 'component.json', 'aliases.json',
    'lang/en.json', 'lang/ru.json'].map((file) => `${folder}/${file}`).sort());
});

test('the former public variables feed the feed\'s, and the sheet sets nothing else', () => {
  const css = read(`${folder}/js/templates/default.css`);
  const contract = json(`${folder}/component.json`);
  const feed = json('src/smart/list-feed/component.json');
  const pairs = [['column-width', 'column'], ['inset', 'inset'], ['run-gap', 'gap-run'], ['turn-gap', 'gap-turn'], ['fade-size', 'fade']];
  assert.deepEqual(Object.keys(contract['css-variables']).sort(), pairs.map(([name]) => `--sf-message-log-${name}`).sort());
  for (const [name, internal] of pairs) {
    assert.ok(feed['css-variables'][`--sf-list-feed-${name}`], `the feed offers --sf-list-feed-${name}`);
    assert.match(css, new RegExp(`--sf-list-feed--${internal}: var\\(--sf-message-log-${name}, var\\(--sf-list-feed-${name}, `, 'u'),
      `--sf-message-log-${name} feeds the feed before --sf-list-feed-${name}`);
  }
  const declared = [...css.matchAll(/(--sf-[a-z0-9\\/-]+)\s*:/gu)].map(([, token]) => token);
  assert.deepEqual(declared.sort(), pairs.map(([, internal]) => `--sf-list-feed--${internal}`).sort());
  assert.match(css, /sf-message-log > \.sf-list-feed \{/u);
});

test('the docs name every former name with the one that replaces it', () => {
  const docs = read(`${folder}/docs.md`);
  for (const name of ['sf-list-feed', 'messages', 'items', 'setMessages', 'setItems', 'prependMessages', 'prependItems',
    'renderMessage', 'renderItem', 'announceMessage', 'announceItem', 'setHasMore', 'isNearBottom', 'isAtLatest', 'cl-list-feed', 'sf-message-log-load-earlier',
    ...VERBS.flatMap((verb) => [`sf-message-log-${verb}`, `sf-list-feed-${verb}`])]) {
    assert.match(docs, new RegExp(`\`${name}(\\(|\`)`, 'u'), `docs.md names ${name}`);
  }
  assert.match(docs, new RegExp(UNTIL, 'u'));
});

test('the words stay the conversation\'s, under the feed\'s keys', () => {
  const feed = (language) => Object.keys(json(`src/smart/list-feed/lang/${language}.json`).runtime).sort();
  for (const language of ['en', 'ru']) {
    assert.deepEqual(Object.keys(json(`${folder}/lang/${language}.json`).runtime).sort(), feed(language), `lang/${language}: the feed's keys`);
  }
  assert.match(code(`${folder}/index.js`), /sfWord\(key, \{count, vars\} = \{\}\) \{\s*return pageWord\(WORDS, key, this, \{component: TAG/u);
});
