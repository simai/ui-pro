// The Pro chat and mail pass over SIMAI Framework group build 9 (DEV letter
// msg-bdf82830, owner decision C275, 2026-11-17): what the sources must say.
// The look in a page is measured by ui-control's headless probe of the pass
// (1440 and 390, light and dark); this is the half that needs no browser.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = (component, path) => readFileSync(join(root, 'src', 'smart', component, path), 'utf8');
const uncommented = (css) => css.replace(/\/\*[\s\S]*?\*\//gu, '');
const rule = (css, selector) => {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `the sheet has ${selector}`);
  return css.slice(at, css.indexOf('}', at));
};

test('C275: the composer box is flat at rest, its edge drawn', () => {
  const css = uncommented(read('chat-composer', 'js/templates/default.css'));
  const box = rule(css, '.sf-chat-composer__box');
  assert.doesNotMatch(box, /box-shadow/u, 'no raised shadow on the field');
  assert.match(box, /border: var\(--sf-px\) solid/u, 'the edge stays');
});

test('C275: the window parts the field from a log that runs under it, with its line', () => {
  const css = uncommented(read('chat-window', 'js/templates/default.css'));
  assert.match(rule(css, '.chat-shell__composer[data-log-under]'), /box-shadow: inset 0 var\(--sf-px\) 0 var\(--sf-outline-variant\)/u);
  assert.doesNotMatch(css, /\.sf-chat-composer__box \{ box-shadow: none; \}/u, 'no rule left to take a shadow away');
  const source = read('chat-window', 'index.js');
  assert.match(source, /list\.addEventListener\("scroll", \(\) => \{\s*this\.maybeRead\(\);\s*this\.syncComposerEdge\(\);/u, 'a scroll of the log asks again');
  assert.match(source, /syncComposerEdge\(\) \{[\s\S]*?scrollHeight - scroller\.scrollTop - scroller\.clientHeight > 1[\s\S]*?toggleAttribute\("data-log-under", under\)/u);
});

test('PRO-CH-3: file chips wrap inside the field, none off its edge', () => {
  const css = uncommented(read('chat-composer', 'js/templates/default.css'));
  const files = rule(css, '.sf-chat-composer__files');
  assert.match(files, /flex-wrap: wrap/u);
  assert.doesNotMatch(files, /overflow-x|scrollbar-width: none/u, 'no row scrolled sideways without a bar');
  // A file is the Framework's sf-file-preview chip (C149), capped by the row it wraps in.
  assert.match(rule(css, '.sf-chat-composer__file'), /max-inline-size: 100%/u);
});

test('C141 (1): the composer counts from 80 % of the limit, as the Framework fields', () => {
  assert.match(read('chat-composer', 'index.js'), /const near = length >= limit \* 0\.8;/u);
});

test('C141 (2): a multi-line property is the Framework field as it is, 3 to 10 rows', () => {
  const template = read('mail-inspector', 'js/templates/default.js');
  assert.doesNotMatch(template, /min-rows|max-rows/u);
});

test('C15: the quiet ⋯ of letters and of the structure names its scheme', () => {
  assert.match(read('mail-letters', 'js/templates/default.js'), /appearance="ghost" scheme="on-surface-variant" icon="more_horiz" data-action="more"/u);
  assert.match(read('mail-structure', 'js/templates/default.js'), /class="sf-mail-structure-more" size="1\/2" appearance="ghost" scheme="on-surface-variant"/u);
});

test('C15: the chat draws its icon buttons ghost, not the dated link look', () => {
  assert.match(read('chat-message', 'js/view/message.js'), /export function iconButton\(ctx, \{ icon, label, appearance = 'ghost'/u);
  assert.match(read('chat-composer', 'js/templates/parts.js'), /appearance = "ghost",/u);
  assert.doesNotMatch(read('chat-window', 'js/preview-view.js'), /sf-icon-button--link/u);
});
