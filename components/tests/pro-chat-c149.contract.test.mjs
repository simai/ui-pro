// Owner decision C149 (1), (2), (3): the Pro chat's files are SIMAI
// Framework's sf-file-preview chip, not the chat's own markup. The look in a
// page is measured by ui-control's headless probe (1440 and 390, light and
// dark); this is the half that needs no browser.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = (component, path) => readFileSync(join(root, 'src', 'smart', component, path), 'utf8');
const json = (component) => JSON.parse(read(component, 'component.json'));

test('C149: a file over the composer is the Framework chip, its requests answered by the composer', () => {
  const template = read('chat-composer', 'js/templates/default.js');
  assert.match(template, /<sf-file-preview[\s\S]*?appearance="chip"/u);
  assert.doesNotMatch(template, /renderAttachment\(/u, 'no own chip in the composer');
  assert.match(template, /@sf-file-preview-detach=\$\{\(event\) => \{ event\.stopPropagation\(\); event\.preventDefault\(\); component\.removeFile\(file\); \}\}/u);
  assert.match(template, /@sf-file-preview-retry=[^\n]*component\.retryFile\(file\)/u);
  assert.match(read('chat-composer', 'index.js'), /retryFile\(file\) \{\s*this\.removeFile\(file\);\s*if \(this\.canAttach\(\)\) this\.pick\(\);/u);
  assert.doesNotMatch(read('chat-composer', 'js/templates/default.css'), /\.sf-chat-attachment/u, 'no chip rules left in the composer');
});

test('C149: a message draws its files through ctx.file on a Framework page, the chip without one', () => {
  const view = read('chat-message', 'js/view/message.js');
  assert.match(view, /if \(ctx\.file\) \{[\s\S]*?return ctx\.file\(/u);
  const element = read('chat-message', 'index.js');
  assert.match(element, /file\(file, \{onRemove = null, onRetry = null, onDownload = null\} = \{\}\) \{\s*const preview = documentRef\.createElement\("sf-file-preview"\);\s*preview\.setAttribute\("appearance", "chip"\);/u);
  for (const name of ['sf-file-preview-detach', 'sf-file-preview-retry', 'sf-file-preview-download']) {
    assert.match(element, new RegExp(`addEventListener\\("${name}", \\(event\\) => \\{\\s*event\\.stopPropagation\\(\\);`, 'u'), `${name} stops at the message`);
  }
  assert.match(read('chat-message', 'js/view/person.js'), /if \(ctx\.file\) \{[\s\S]*?onRetry: retryFile/u);
});

test('C149: both fetch the Framework file preview lazily and say so in their versions', () => {
  for (const [component, version] of [['chat-composer', '1.4.0'], ['chat-message', '1.9.0']]) {
    const manifest = json(component);
    assert.equal(manifest.version, version);
    assert.ok(manifest.relations.some((one) => one.name === 'cl-file-preview' && one.lazy === true), `${component} relation`);
    assert.match(read(component, 'rule.js'), /\{ name: 'cl-file-preview', lazy: true \}/u);
  }
});
