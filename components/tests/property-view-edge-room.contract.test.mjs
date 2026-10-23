import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

// The record panel's close, copy-link and open-full controls stand on the
// drawer's edge. Beside a wide panel the drawer places them a step beyond the
// panel's width and does not look at the window, so the panel has to leave them
// room; in a panel that fills the screen the drawer brings them inside along the
// top, so the head has to leave them room. Neither held: at 980px the strip
// stood at x = -20 (half cut off) and on a phone it covered the record's name
// (docs review, round 4, 2026-10-20). The probe
// tests/browser/property-view-narrow-edge.browser.mjs measures both.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'src/smart/property-view/index.js'), 'utf8');
const template = readFileSync(resolve(root, 'src/smart/property-view/js/templates/default.js'), 'utf8');
const sheet = readFileSync(resolve(root, 'src/smart/property-view/js/templates/default.css'), 'utf8');

const body = (text, start) => {
  const at = text.indexOf(start);
  assert.ok(at >= 0, `${start} is in the source`);
  return text.slice(at, text.indexOf('\n    }\n', at));
};

test('a wide panel is never wider than the window less the edge strip', () => {
  const width = body(source, '    get drawerWidth() {');
  assert.match(width, /return `min\(\$\{wanted\}, calc\(100vw - \$\{this\.edgeRoom\}\)\)`;/u,
    'every wide width, railed or not, is capped by the strip');
  assert.doesNotMatch(width, /100vw - var\(--sf-space-4\)/u, 'the old cap left 32px for a 64px strip');
});

test('the edge strip is one control and the drawer step on each side', () => {
  assert.match(body(source, '    get edgeRoom() {'),
    /return `calc\(\$\{this\.edgeControlWidth\} \+ 2 \* var\(--sf-space-1\\\\\/2\)\)`;/u);
  // The control's own width: an sf-icon-button is its text height and the
  // ladder's padding on both sides.
  assert.match(body(source, '    get edgeControlWidth() {'),
    /calc\(var\(--sf-text-height-\$\{step\}\) \+ 2 \* var\(--sf-ui-\$\{step\}--space-y-tightness-default\)\)/u);
  assert.match(body(source, '    get edgeControlCount() {'),
    /return 1 \+ \(this\.address \? 1 : 0\) \+ \(this\.canOpenFullPage \? 1 : 0\);/u);
});

test('in a panel that fills the screen the strip is a row and the head keeps its room', () => {
  assert.match(template, /function panelFills\(context\) \{\n\s+return !context\.wide \|\| context\.panelSize === 'full';\n\}/u);
  assert.match(template, /class="sf-property-view-edge flex \$\{panelFills\(context\) \? 'flex-row' : 'flex-col'\} gap-1\/2" slot="edge"/u);
  assert.match(template, /\$\{panelFills\(context\) \? ' sf-property-view-panel--fills' : ''\}/u);
  assert.match(template, /--sf-property-view--edge-room: calc\(\$\{context\.edgeControlCount\} \* \$\{context\.edgeControlWidth\} \+ \$\{context\.edgeControlCount - 1\} \* var\(--sf-space-1\\\\\/2\)\);/u);
  assert.match(sheet, /\.sf-property-view-panel--fills \.sf-property-view-head \{\n\s+padding-inline-start: calc\(var\(--sf-space-1\) \+ var\(--sf-property-view--edge-room, 0px\) \+ var\(--sf-space-1\\\/2\)\);\n\s+\}/u);
});
