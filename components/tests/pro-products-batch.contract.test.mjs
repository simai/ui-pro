// The Pro products batch of 2026-11-17 (dispatcher handoffs after Pro over
// group build 9): what the package components write must follow the owner
// decisions the Framework already carries.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('a person\'s avatar asks for hue, not the former name tone (C17)', async () => {
  for (const path of ['src/smart/chat-message/index.js', 'src/smart/chat-window/index.js']) {
    const source = await read(path);
    assert.doesNotMatch(source, /setAttribute\("tone"/u, path);
    assert.match(source, /setAttribute\("hue", "auto"\)/u, path);
  }
});

test('sf-mail-inspector hears sf-input-image under its current event names (IF-16; ui-mail e2e-m2)', async () => {
  // sf-input-image sends sf-image-field-* only under its dated tag
  // sf-image-field; the inspector draws sf-input-image, so it heard nothing.
  const template = await read('src/smart/mail-inspector/js/templates/default.js');
  assert.doesNotMatch(template, /@sf-image-field-/u, 'no retired event names');
  const heard = [...template.matchAll(/@(sf-input-image-[a-z]+)=/gu)].map((match) => match[1]).sort();
  assert.deepEqual(heard, ['sf-input-image-attach', 'sf-input-image-detach', 'sf-input-image-rejected']);
  // Each is an event the Framework's field declares (the overlay holds ui-source).
  let field = null;
  try {
    field = await read('src/smart/input-image/component.json');
  } catch {
    return; // outside the overlay: the names above are the check
  }
  for (const name of heard) assert.ok(field.includes(`"${name}"`) || field.includes(name), `${name} is declared by sf-input-image`);
});

test('the package\'s own card surfaces read the surface role (the card\'s unit), not a scale step', async () => {
  for (const path of [
    'src/smart/chat-interlocutor/js/templates/default.css',
    'src/smart/chat-threads/js/templates/default.css',
    'src/smart/editor-content/js/templates/default.css',
  ]) {
    const source = await read(path);
    assert.doesNotMatch(source, /var\(--sf-radius-1\)/u, path);
    assert.match(source, /var\(--sf-radius--surface\)/u, path);
  }
});
