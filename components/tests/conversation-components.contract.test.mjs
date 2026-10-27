// The three conversation components promoted from simai/ui-chat (owner,
// 2026-10-25): sf-message-log, sf-thread-list and sf-change-confirm. Promoted,
// not copied -- so what made them chat-only must not have come along, and what a
// host binds to (attributes, events, words) must be the same in the source, the
// manifest and the docs. Their behaviour is held by the browser probes beside
// these (tests/browser/message-log.browser.mjs and the two after it); this holds
// the half that needs no browser.
//
// It runs in the overlay (ui-source at the pinned revision with this repository
// laid over it), so the free Framework's own sheets and rules are beside it.
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const json = (path) => JSON.parse(read(path));

const COMPONENTS = {
  'message-log': {element: 'sf-message-log', id: 'smart.message-log', dictionary: 'MESSAGE_LOG_TEXT'},
  'thread-list': {element: 'sf-thread-list', id: 'smart.thread-list', dictionary: 'THREAD_LIST_TEXT'},
  'change-confirm': {element: 'sf-change-confirm', id: 'smart.change-confirm', dictionary: 'CHANGE_CONFIRM_TEXT'},
};

// The code without its comments: a comment may say where a component came
// from (sf-chat-message-list) without the code carrying any of it.
const code = (path) => read(path)
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .replace(/(^|[^:"'`\\])\/\/.*$/gmu, '$1')
  .replace(/<!--[\s\S]*?-->/gu, '');

const sources = (name) => ['index.js', 'js/templates/default.js', 'js/templates/default.css', 'rule.js']
  .map((file) => `src/smart/${name}/${file}`);

// A component moved to standard simai.smart-component 1.3.8 holds its
// contract in component.json (settings, events, actions, words in lang/,
// dated aliases in aliases.json); the element is made from it by
// core/js/element-manifest.js. The checks below read that form where it is.
const migrated = (name) => existsSync(resolve(root, `src/smart/${name}/component.json`));
const contract = (name) => json(`src/smart/${name}/component.json`);
const own = (name) => [`src/smart/${name}/component.json`, `src/smart/${name}/aliases.json`,
  `src/smart/${name}/lang/en.json`, `src/smart/${name}/lang/ru.json`];

// The keys of `static get props()`, with the attribute each one answers to.
const declaredProps = (source) => {
  const start = source.indexOf('static get props()');
  const body = source.slice(start, source.indexOf('\n    }\n', start));
  return [...body.matchAll(/^\s{12}(\w+):\s*\{([^}]*)\}/gmu)].map(([, key, spec]) => ({
    key,
    attribute: spec.match(/attribute:\s*"([^"]+)"/u)?.[1] ?? key.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`),
    default: spec.match(/default:\s*("[^"]*"|false|true|\[\])/u)?.[1],
    values: spec.match(/values:\s*(\[[^\]]*\]|STATES)/u)?.[1],
  }));
};

// The two branches of a component's dictionary, en first as the floor.
const dictionary = (source, name) => {
  const start = source.indexOf(`const ${name} = {`);
  assert.ok(start >= 0, `${name} is declared`);
  const body = source.slice(start, source.indexOf('\n};', start));
  const branch = (language) => {
    const from = body.indexOf(`    ${language}: {`);
    return new Set([...body.slice(from, body.indexOf('\n    },', from)).matchAll(/^\s{8}(\w+):/gmu)].map(([, key]) => key));
  };
  return {en: branch('en'), ru: branch('ru')};
};

test('the conversation components carry nothing chat-only from ui-chat', () => {
  for (const name of Object.keys(COMPONENTS)) {
    for (const path of sources(name)) {
      const source = code(path);
      const absent = (pattern, message) => assert.ok(!pattern.test(source), `${path}: ${message} (${source.match(pattern)?.[0]})`);
      // No chat names, tokens or classes: the components are promoted under
      // neutral names, and a --sf-chat-* token is ui-chat's adaptation point,
      // not the Framework's.
      absent(/sf-chat|--sf-chat|chat-core|component\/chat/u, 'a chat name came along');
      // Roles are data: no component decides what "user" or "assistant" mean,
      // nor knows a command a server expects.
      absent(/["']assistant["']|role\s*===\s*["']user["']|confirm_command|cancel_command|send-command/u, 'a chat role or command');
      // Nothing is parsed as markup: a message, a title and a value are text.
      absent(/innerHTML|insertAdjacentHTML|unsafeHTML|DOMParser/u, 'markup parsed');
      // Nothing is fetched: every request leaves as an event.
      absent(/\bfetch\(|XMLHttpRequest|WebSocket|EventSource/u, 'the component reaches the network');
    }
  }
});

test('the conversation components depend on the Framework alone', () => {
  for (const name of Object.keys(COMPONENTS)) {
    for (const path of sources(name).filter((file) => file.endsWith('.js'))) {
      for (const [, spec] of read(path).matchAll(/from\s+["']([^"']+)["']|import\s+["']([^"']+)["']/gu)) {
        if (!spec) continue;
        // lit, the Framework's core by relative path, or the component's own files.
        const allowed = spec === 'lit' || spec.startsWith('lit/') || spec.startsWith('../../core/js/') || spec.startsWith('./');
        assert.ok(allowed, `${path} imports ${spec}`);
      }
    }
  }
});

test('the stylesheets read Framework tokens or their own public variables, nothing else', () => {
  // The built core sheet, where the tokens are declared: beside the source as
  // declared-tokens reads it, or at UI_CORE_ROOT. Without it only the sheets'
  // own declarations are checked.
  const sheet = resolve(process.env.UI_CORE_ROOT ?? resolve(root, '../ui'), 'distr/core/css/core.css');
  const core = existsSync(sheet) ? readFileSync(sheet, 'utf8') : '';
  const declared = new Set([...core.matchAll(/(--sf-[a-z0-9\\/-]+)\s*:/gu)].map(([, token]) => token.replace(/\\/gu, '')));
  for (const name of Object.keys(COMPONENTS)) {
    const css = read(`src/smart/${name}/js/templates/default.css`);
    // 1.3.8 (§6): the public variables are component.json's css-variables, in
    // the Framework's form --sf-<component>-<name>: read, never set.
    const publicVariables = migrated(name) ? Object.keys(contract(name)['css-variables']) : [];
    for (const variable of publicVariables) {
      assert.match(variable, new RegExp(`^--sf-${name}-[a-z]+(-[a-z]+)*$`, 'u'), `${name}: public variable ${variable}`);
      assert.match(css, new RegExp(`var\\(\\s*${variable}\\b`, 'u'), `${name}: the sheet reads ${variable}`);
      assert.doesNotMatch(css, new RegExp(`${variable}\\s*:`, 'u'), `${name}: the sheet sets ${variable}`);
    }
    const own = new Set([...css.matchAll(/(--sf-[a-z0-9\\/-]+)\s*:/gu)].map(([, token]) => token.replace(/\\/gu, '')));
    for (const own_token of own) {
      // A sheet declares only its own public hooks, --sf-<component>--<part>,
      // and the one hook of a Smart child it sets: the log's jump button takes
      // the icon button's public background.
      if (own_token === '--sf-icon-button-background-color') continue;
      assert.match(own_token, new RegExp(`^--sf-${name}--[a-z-]+$`, 'u'), `${name}: declares ${own_token}`);
    }
    for (const [, token] of css.matchAll(/var\(\s*(--sf-[a-z0-9\\/-]+)/gu)) {
      const plain = token.replace(/\\/gu, '');
      if (own.has(plain) || publicVariables.includes(plain)) continue;
      // A Smart button's own hook is set on it, not read: the one the log sets
      // is the icon button's public background.
      if (plain === '--sf-icon-button-background-color') continue;
      if (declared.size) assert.ok(declared.has(plain), `${name}: reads ${plain}, which the Framework does not declare`);
    }
    // Five to ten public variables a component offers (owner, 2026-10-13).
    own.delete('--sf-icon-button-background-color');
    const offered = migrated(name) ? publicVariables.length : own.size;
    assert.ok(offered >= 5 && offered <= 10, `${name}: ${offered} public CSS variables`);
  }
});

test('the rule, the manifest and the folder name one component', () => {
  for (const [name, {element, id}] of Object.entries(COMPONENTS)) {
    const rule = read(`src/smart/${name}/rule.js`);
    const manifest = json(`src/smart/${name}/smart.manifest.json`);
    // The package build requires smart/<folder>/rule.js to write cl-<folder>.
    assert.match(rule, new RegExp(`SF\\.RuleLoader\\["cl-${name}"\\]`, 'u'), `${name}: the rule key`);
    assert.match(rule, new RegExp(`tags: \\["${element}"\\]`, 'u'), `${name}: the tag`);
    assert.match(rule, /css: true/u, `${name}: the template's sheet ships`);
    assert.equal(manifest.id, id);
    assert.equal(manifest.custom_element, element);
    if (migrated(name)) {
      assert.equal(contract(name).id, id);
      assert.equal(contract(name).tag, element);
      assert.equal(contract(name).version, manifest.version, `${name}: the two manifests carry one version`);
    }
    assert.match(read(`src/smart/${name}/index.js`), new RegExp(`\\.define\\("${element}"\\)`, 'u'));
    // What the rule fetches is what the manifest says the component is built
    // from: a Smart relation cl-x is the registry's smart.x.
    const relations = [...rule.matchAll(/name:\s*"(cl-[a-z-]+)"/gu)].map(([, relation]) => `smart.${relation.slice(3)}`).sort();
    assert.deepEqual([...manifest.composition.uses].sort(), relations, `${name}: composition.uses and the rule's Smart relations`);
    assert.equal(manifest.ownership.source, 'simai/ui-pro');
    assert.ok(existsSync(resolve(root, `src/smart/${name}/docs.md`)), `${name}: docs.md`);
  }
});

test('every declared attribute is in the manifest with the same default and values, and in the docs', () => {
  for (const name of Object.keys(COMPONENTS).filter((one) => !migrated(one))) {
    const source = read(`src/smart/${name}/index.js`);
    const inputs = json(`src/smart/${name}/smart.manifest.json`).inputs.properties;
    const docs = read(`src/smart/${name}/docs.md`);
    const props = declaredProps(source);
    assert.ok(props.length >= 4, `${name}: the props are found`);
    for (const prop of props) {
      const attribute = prop.key === 'templateName' ? 'template' : prop.attribute;
      const input = inputs[attribute];
      assert.ok(input, `${name}: ${attribute} is not in the manifest`);
      if (prop.default !== undefined) assert.deepEqual(input.default, JSON.parse(prop.default), `${name}: ${attribute} default`);
      if (prop.values && prop.values !== 'STATES') assert.deepEqual(input.enum, JSON.parse(prop.values), `${name}: ${attribute} values`);
      if (attribute !== 'template') assert.match(docs, new RegExp(`\`${attribute}\``, 'u'), `${name}: ${attribute} is not in docs.md`);
    }
  }
});

test('a 1.3.8 component: every setting is in the docs, the element is made from component.json', () => {
  for (const name of Object.keys(COMPONENTS).filter(migrated)) {
    const source = read(`src/smart/${name}/index.js`);
    const docs = read(`src/smart/${name}/docs.md`);
    assert.match(source, /elementFromManifest\(manifest, \{/u, `${name}: elementFromManifest`);
    assert.match(source, /import manifest from "\.\/component\.json"/u, `${name}: the manifest is imported`);
    assert.match(source, /import aliases from "\.\/aliases\.json"/u, `${name}: the aliases are imported`);
    for (const setting of Object.keys(contract(name).settings)) assert.match(docs, new RegExp(`\`${setting}\``, 'u'), `${name}: ${setting} is not in docs.md`);
    // No module counter makes an id (§7.1.1, simai/ui-source#41).
    assert.doesNotMatch(code(`src/smart/${name}/index.js`), /let \w+Ids? = 0/u, `${name}: a counter id`);
  }
});

test('a 1.3.8 component sends only the events it declares, by verb; the docs name the new and the old names', () => {
  for (const name of Object.keys(COMPONENTS).filter(migrated)) {
    const source = code(`src/smart/${name}/index.js`);
    const manifest = contract(name);
    const docs = read(`src/smart/${name}/docs.md`);
    const sent = [...new Set([...source.matchAll(/sfEmit\(\s*"([a-z-]+)"/gu)].map(([, verb]) => verb))].sort();
    assert.deepEqual(sent, Object.keys(manifest.events).sort(), `${name}: sent and declared events`);
    assert.doesNotMatch(source, /new CustomEvent\(\s*[`"']sf-/u, `${name}: an event made by hand`);
    for (const verb of sent) assert.match(docs, new RegExp(`\`${manifest.tag}-${verb}\``, 'u'), `${name}: ${manifest.tag}-${verb} is not in docs.md`);
    const aliases = json(`src/smart/${name}/aliases.json`).aliases;
    for (const row of aliases.filter((one) => one.kind === 'event' && one.to)) {
      assert.match(docs, new RegExp(`\`${row.from}\``, 'u'), `${name}: the old name ${row.from} is not in docs.md`);
      assert.equal(row.since, '2026-10-27');
      assert.equal(row.remove_after, '2026-12-01');
    }
    // An own verb has its word in every language (§8, §11).
    for (const [verb, event] of Object.entries(manifest.events).filter(([, one]) => one['own-verb'])) {
      for (const language of ['en', 'ru']) assert.ok(json(`src/smart/${name}/lang/${language}.json`).events?.[verb]?.label, `${name}: lang/${language} events.${verb}.label`);
    }
  }
});

test('every event the source dispatches is in the manifest and the docs, and nothing else is', () => {
  for (const name of Object.keys(COMPONENTS).filter((one) => !migrated(one))) {
    const source = read(`src/smart/${name}/index.js`);
    const manifest = json(`src/smart/${name}/smart.manifest.json`);
    const docs = read(`src/smart/${name}/docs.md`);
    // Literal names, and the one template literal: sf-change-confirm-${kind}.
    const literal = [...source.matchAll(/["'`](sf-[a-z-]+?)["'`]/gu)].map(([, event]) => event)
      .filter((event) => event.startsWith(`sf-${name}-`));
    const templated = /`sf-change-confirm-\$\{kind\}`/u.test(source) ? ['sf-change-confirm-accept', 'sf-change-confirm-decline'] : [];
    const dispatched = [...new Set([...literal, ...templated])].filter((event) => !event.endsWith('-heading')).sort();
    assert.deepEqual(dispatched, Object.keys(manifest.events).sort(), `${name}: dispatched and declared events`);
    for (const event of dispatched) assert.match(docs, new RegExp(`\`${event}\``, 'u'), `${name}: ${event} is not in docs.md`);
  }
});

test('every word is offered in English and Russian, and the docs name every key', () => {
  for (const name of Object.keys(COMPONENTS).filter(migrated)) {
    const words = (language) => Object.keys(json(`src/smart/${name}/lang/${language}.json`).runtime);
    assert.ok(words('en').length >= 5, `${name}: the words are found`);
    assert.deepEqual(words('ru').sort(), words('en').sort(), `${name}: the same keys in both languages`);
    const source = code(`src/smart/${name}/index.js`);
    assert.doesNotMatch(source, /\|\| ['"]ru['"]\)|documentElement\.lang|pageText\(/u, `${name}: its own language rule`);
    const docs = read(`src/smart/${name}/docs.md`);
    for (const key of words('en')) assert.match(docs, new RegExp(`\`${key}\``, 'u'), `${name}: the word ${key} is not in docs.md`);
  }
  for (const [name, {dictionary: constant}] of Object.entries(COMPONENTS).filter(([one]) => !migrated(one))) {
    const source = read(`src/smart/${name}/index.js`);
    const {en, ru} = dictionary(source, constant);
    assert.ok(en.size >= 5, `${name}: the dictionary is found`);
    assert.deepEqual([...ru].sort(), [...en].sort(), `${name}: the same keys in both languages`);
    // Words come from the shared page language, never from a component's own
    // reading of <html lang> with a Russian fallback.
    assert.match(source, new RegExp(`pageText\\(${constant}, key, this\\)`, 'u'));
    assert.doesNotMatch(source, /\|\| ['"]ru['"]\)|documentElement\.lang/u, `${name}: its own language rule`);
    const docs = read(`src/smart/${name}/docs.md`);
    for (const key of en) assert.match(docs, new RegExp(`\`${key}\``, 'u'), `${name}: the word ${key} is not in docs.md`);
  }
});

test('the manifests hash the files they name, and name their own folder', () => {
  // sf-contract verify holds the hashes (smart-contract-registry-package); this
  // holds the list: a component's provenance names its template, sheet, rule and
  // docs, so a change to any of them is a change the registry sees.
  for (const name of Object.keys(COMPONENTS)) {
    const manifest = json(`src/smart/${name}/smart.manifest.json`);
    const paths = manifest.provenance.source_artifacts.map((artifact) => artifact.path).sort();
    const named = [...sources(name), `src/smart/${name}/docs.md`, ...(migrated(name) ? own(name) : [])];
    assert.deepEqual(paths, named.sort(), `${name}: provenance`);
    assert.equal(manifest.provenance.source_repository, 'simai/ui-pro');
  }
});

test('the message log draws a message through the host, as text when the host does not', () => {
  const source = read('src/smart/message-log/index.js');
  // The host's renderer is a property, and a string it returns is a text node.
  assert.match(source, /set renderMessage\(value\)/u);
  assert.match(source, /content instanceof Node \? content : this\.ownerDocument\.createTextNode/u);
  // The default renderer writes text only.
  assert.match(source, /bubble\.textContent = String\(message\.text \?\? ""\)/u);
  // Authors are data: runs are consecutive messages of one author and side.
  assert.match(source, /authorOf\(other\) === authorOf\(item\.message\)/u);
  // The column is one stable node: lit places it and never diffs the items.
  assert.match(read('src/smart/message-log/js/templates/default.js'), /\$\{context\.column\}/u);
});

test('the change confirmation applies nothing and keeps the question open when the host refuses the answer', () => {
  const source = read('src/smart/change-confirm/index.js');
  assert.equal(contract('change-confirm').events.answer.cancelable, true);
  assert.match(source, /const delivered = this\.sfEmit\("answer", \{id: this\.changeId, accepted\}\);/u);
  assert.match(source, /if \(!delivered\) \{\s*this\._pressed = null;\s*this\.setAttribute\("state", "open"\);/u);
  // Both answers weigh the same.
  const template = read('src/smart/change-confirm/js/templates/default.js');
  assert.equal([...template.matchAll(/appearance="outline"/gu)].length, 2);
});
