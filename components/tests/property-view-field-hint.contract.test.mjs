import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

// A field's hint was drawn as a glyph carrying its words in a native `title`:
// <i class="sf-icon" tabindex="0" title=... aria-label=...>info</i>. A title
// needs a hover, so on a touch device the hint could not be read at all --
// there was nothing to hover with (Larena storage QA, 2026-10-22, finding 4).
// The Framework has its own affordance for exactly this, sf-help-mark: a button
// that opens the explanation on a press and announces it politely, so a finger
// and a keyboard reach it as a mouse does.
//
// A tag a component renders is also a tag it has to fetch. The free suite's
// loader checks catch a missing relation generically; this one states the
// decision, so the hint cannot quietly become a hover again.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const template = read('src/smart/property-view/js/templates/default.js');
const styles = read('src/smart/property-view/js/templates/default.css');
const rule = read('src/smart/property-view/rule.js');
const manifest = JSON.parse(read('src/smart/property-view/smart.manifest.json'));

// The one branch that draws the hint beside a field's label.
const hint = template.match(/\$\{field\.hint\b[\s\S]*?: nothing\}/u)?.[0];

test('a field hint opens on a press, and keeps the hint as its accessible name', () => {
  assert.ok(hint, 'the label row still draws a hint');
  assert.match(hint, /<sf-help-mark\b/u, 'the hint is drawn through sf-help-mark');
  assert.doesNotMatch(hint, /\btitle=/u, 'no native title: a title is a hover, and a touch device has none');
  assert.doesNotMatch(hint, /\bclass="sf-icon/u, 'the glyph with a tooltip is gone');
  assert.doesNotMatch(hint, /\btabindex=/u, 'the mark brings its own button, so the hint needs no tabindex of its own');
  // sf-help-mark names its button with `label` and opens `text`. The name was
  // the hint itself on the glyph's aria-label, and it stays the hint.
  assert.match(hint, /label=\$\{String\(field\.hint\)\}/u, 'the accessible name is the hint');
  assert.match(hint, /text=\$\{String\(field\.hint\)\}/u, 'and the explanation it opens is the hint');
});

test('the hint is a control now, not something to hold a pointer over', () => {
  assert.doesNotMatch(styles, /cursor:\s*help/u, 'cursor: help described the affordance that was replaced');
});

test('the component declares sf-help-mark where the Loader reads and where a reader reads', () => {
  assert.ok(
    manifest.composition.uses.includes('smart.help-mark'),
    'the manifest says what the component is built from',
  );
  assert.match(rule, /\{\s*name:\s*"cl-help-mark"\s*\}/u, 'and the rule fetches it');
  // A page that loads sf-property-view on demand gets only what the rule
  // fetches: an undeclared tag is an element that never upgrades, which looks
  // exactly like a hint that does nothing.
  const relations = new Set([...rule.matchAll(/name:\s*"([^"]+)"/gu)].map((match) => match[1]));
  assert.ok(relations.has('cl-help-mark'));
});
