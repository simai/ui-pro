// Docs round 4 found these in the Pro components, not in the docs
// (ui-control evidence 2026-11-18-docs-fixes, items DF-10..DF-14 and DF-16; this
// branch's evidence 2026-11-18-df10-pro). Each is held here by what the
// source says; the browser half is the probe in that evidence.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../src/smart/${path}`, import.meta.url), 'utf8');
const json = (path) => JSON.parse(read(path));
const code = (path) => read(path)
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .replace(/(^|[^:"'`\\])\/\/.*$/gmu, '$1');

test('DF-10: «Мои файлы» make sf-progress-bar when a quota comes, not with the closed view', () => {
  const view = code('chat-window/js/files-view.js');
  const build = view.slice(view.indexOf('build(headingTag) {'), view.indexOf('say(text)'));
  const usage = view.slice(view.indexOf('drawUsage(data) {'), view.indexOf('row(file) {'));
  assert.ok(build.length > 0 && usage.length > 0, 'build() and drawUsage() are found');
  assert.doesNotMatch(build, /sf-progress-bar/u, 'the closed view holds no undefined tag');
  assert.match(usage, /createElement\('sf-progress-bar'\)/u);
  assert.equal(json('chat-window/component.json').version, '1.16.3');
});

test('DF-11: the items menu draws no «Избранное» button without an action', () => {
  const template = code('admin-menu/js/templates/default.js');
  assert.doesNotMatch(template, /menuText\("favorites"\)/u);
  assert.equal(json('admin-menu/component.json').version, '1.14.4');
});

test('DF-12: sf-editor names its keys through the sf-kbd helper, not in Mac glyphs (C04)', () => {
  const template = code('editor/js/templates/default.js');
  const index = code('editor/index.js');
  assert.match(template, /import \{shortcutView\} from "\.\.\/\.\.\/\.\.\/\.\.\/component\/kbd\/js\/shortcut"/u);
  for (const [name, source] of [['template', template], ['index.js', index]]) {
    assert.doesNotMatch(source, /[⌘⇧⌥]/u, `${name}: no Mac glyph written by hand`);
    assert.doesNotMatch(source, /\(Alt\+|shortcut: "Alt\+/u, `${name}: no Alt+ written by hand`);
  }
  for (const entry of ['alt+up', 'alt+down', 'mod+d', 'backspace']) {
    assert.match(index, new RegExp(`shortcut: "${entry.replace('+', '\\+')}"`, 'u'), `the block menu writes ${entry} as notation`);
  }
  for (const locale of ['en', 'ru']) {
    const words = JSON.stringify(json(`editor/lang/${locale}.json`));
    assert.doesNotMatch(words, /[⌘⇧⌥]|Alt\+|Ctrl\+/u, `${locale}: the words take the keys as variables`);
    assert.match(words, /\{undo\}/u);
  }
  const manifest = json('editor/smart.manifest.json');
  for (const name of ['undo', 'redo']) {
    const summary = manifest.methods[name].summary;
    assert.match(summary, /Apple platforms/u, `${name}: both platforms named`);
    assert.match(summary, /Ctrl\+/u, `${name}: both platforms named`);
  }
  assert.equal(manifest.version, '1.3.3');
});

test('DF-13: the package declares sf-editor-content retired, with its date', () => {
  const component = json('editor-content/component.json');
  const manifest = json('editor-content/smart.manifest.json');
  assert.equal(component.version, '1.5.3');
  assert.equal(manifest.version, '1.5.3');
  assert.equal(manifest.lifecycle, 'deprecated');
  assert.equal(manifest.compatibility.replacement, '<sf-editor>');
  assert.equal(component['x-retirement'].replacement, 'sf-editor');
  assert.equal(component['x-retirement'].since, '2026-11-03');
  assert.equal(component['x-retirement'].remove_after, '2027-01-01');
  // The former tag does not outlive the element.
  assert.equal(component.aliases['remove-after'], component['x-retirement'].remove_after);
  assert.match(manifest.summary, /until 2027-01-01/u);
  assert.match(read('editor-content/docs.md'), /до 2027-01-01/u);
});

test('DF-14: a failed answer outside a window always offers its retry', () => {
  const sheet = read('chat-message/js/templates/default.css').replace(/\/\*[\s\S]*?\*\//gu, '');
  const hiding = [...sheet.matchAll(/([^{}]*\.sf-chat-notice__action)\s*\{\s*display:\s*none;?\s*\}/gu)].map((match) => match[1].trim());
  assert.deepEqual(hiding, ['sf-chat-window .sf-chat-message--failed:not(.sf-chat-message--last) .sf-chat-notice__action']);
  assert.equal(json('chat-message/component.json').version, '1.9.2');
});

test('DF-16: the Library chooses its category with sf-segmented, not a row of toggles (C211 (1))', () => {
  const template = code('mail-library/js/templates/default.js');
  const chips = template.slice(template.indexOf('sf-mail-library-chips'), template.indexOf('sf-mail-library-groups'));
  assert.ok(chips.length > 0, 'the category row is found');
  assert.match(chips, /<sf-segmented size="1\/2" aria-label=\$\{context\.categoryLabel\}/u);
  assert.match(chips, /\.value=\$\{context\.category\}/u);
  assert.match(chips, /filter\(\{category: event\.detail\?\.value\}\)/u);
  assert.doesNotMatch(chips, /sf-button|aria-pressed/u, 'no toggle buttons for a choice of one');
  const component = json('mail-library/component.json');
  assert.equal(component.version, '1.0.7');
  const relations = component.relations.map((relation) => relation.name);
  assert.ok(relations.includes('cl-segmented') && !relations.includes('cl-button'));
});

test('DF-16: the Library rows name their icon size on the ladder, not the old scale', () => {
  const template = code('mail-library/js/templates/default.js');
  assert.doesNotMatch(template, /<sf-icon[^>]* size="2"/u);
  assert.equal(template.match(/data-sf-icon-scale="ladder" size="1\/2"/gu)?.length, 4);
});
