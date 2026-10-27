import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {URL} from 'node:url';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const element = () => read('src/smart/admin-menu/index.js');
const template = () => read('src/smart/admin-menu/js/templates/default.js');
const styles = async () => (await read('src/component/admin-menu/scss/_css__admin_menu.scss'))
  .replace(/\/\*[\s\S]*?\*\//gu, '');

test('the panel is a mode, and the pages that say nothing keep the row', async () => {
  const [source, markup] = await Promise.all([element(), template()]);

  assert.match(source, /searchMode: \{attribute: "search-mode", default: "row"\}/u, 'the default is what every page already has');
  assert.match(source, /isSearchPanelMode\(\) \{\s*return this\.getProp\("searchMode"\) === "panel";/u);
  assert.match(markup, /if \(context\.searchMode === "panel" && !context\.compact\) return nothing;/u, 'no row in panel mode');
  assert.match(
    markup,
    /context\.searchMode === "panel" && !context\.compact\s*\?\s*html`<sf-icon-button\s*data-sf-admin-search-toggle/u,
    'the magnifier lives in the header instead',
  );
  // A collapsed menu shows the magnifier in the icon column and expands straight
  // into the panel rather than into a row the person then has to find.
  assert.match(
    markup,
    /if \(context\.searchMode === "panel"\) \{\s*component\.openSearchPanel\(\);/u,
  );
});

test('the submenu header takes the place of the logo, with the arrow in the icon column', async () => {
  const [markup, css] = await Promise.all([template(), styles()]);


  assert.match(markup, /back: "menu-translations-back"/u, 'the name says where the arrow goes');
  // The height is measured, because the logo is the host's and its height is
  // whatever the host's image is. A fixed token would have made the two headers
  // equal only by luck.
  assert.match(
    css,
    /\.sf-admin-menu-panel-sub \.sf-admin-menu-head,\s*\.sf-admin-menu-panel-search \.sf-admin-menu-head \{\s*min-block-size: var\(\s*--sf-admin-menu-head--min-height,\s*var\(--sf-admin-menu-head--measured-height, var\(--sf-d9\)\)/u,
    'the same height as the header it replaces',
  );
  const source = await element();
  assert.match(
    source,
    /measureHeadHeight\(\) \{[\s\S]*?root\.style\.setProperty\("--sf-admin-menu-head--measured-height"/u,
  );
  assert.match(css, /\.sf-admin-menu-panel-search \.sf-admin-menu-head-container/u);
  // The line under the header is the one the header already had: a submenu
  // header is the same element, so it keeps the divider rather than drawing a
  // second one.
  assert.match(css, /border-bottom-width: var\(--sf-admin-menu-head--border-bottom-width, var\(--sf-px\)\)/u);
});

test('typing searches at all', async () => {
  const [source, markup] = await Promise.all([element(), template()]);

  // Both templates have called `component.search(value)` on every keystroke
  // since the row was added, and nothing answered: the method was never defined,
  // so typing raised a TypeError and searched nothing.
  assert.match(markup, /@input=\$\{\(event\) => component\.search\(event\.target\.value\)\}/u);
  assert.match(source, /search\(text = ""\) \{\s*return this\.startSearch\(text\);/u);
});

test('a query is compared the way a person means it', async () => {
  const source = await element();

  // Case does not matter, ё reads as е, and the end of a word is dropped so
  // "роль" finds "Роли" and "платёж" finds "Платежи". Crude on purpose: the
  // rule the consumer's owner approved, and one that always behaves the same.
  assert.match(source, /normalizeSearchWord = \(value = ""\) =>\s*String\(value \|\| ""\)\.toLowerCase\(\)\.replace\(\/ё\/gu, "е"\)/u);
  assert.match(
    source,
    /searchStem = \(query = ""\) => \{[\s\S]*?if \(word\.length < 4\) return word;[\s\S]*?word\.slice\(0, word\.length - \(word\.length > 5 \? 2 : 1\)\)/u,
  );
  // The sections group is the menu's own answer, nested items included, each
  // naming the section it sits in and the part that matched.
  assert.match(
    source,
    /getSectionResults\(text = ""\) \{[\s\S]*?this\.flattenMenuItems\(this\._itemsData\)[\s\S]*?match: \{start: index, length: stem\.length\}/u,
  );
});

test('the host answers one request, and only the last one is shown', async () => {
  const source = await element();

  assert.match(
    source,
    /this\.sfEmit\("query", Object\.freeze\(\{kind: "menu", query, requestId\}\)\)/u,
  );
  assert.match(source, /\}, 250\);/u, 'after a pause, not on every keystroke');
  assert.match(
    source,
    /setSearchResults\(requestId, groups = \[\]\) \{\s*if \(!requestId \|\| requestId !== this\._searchRequestId\) return false;/u,
    'an answer to a query the person has moved on from is dropped',
  );
  // Text is text and a link is a link inside this site: a host result naming
  // another origin is not rendered at all.
  assert.match(source, /isSameSiteHref = \(href = ""\) =>/u);
  assert.match(source, /resolved\.origin === new URL\(document\.baseURI\)\.origin/u);
  assert.match(source, /\.filter\(\(item\) => item && isSameSiteHref\(item\.href\)\)/u);
  assert.match(source, /text: String\(item\.text \?\? ""\)/u, 'and it arrives as a string, not as markup');
});

test('the field is a combobox and the keys do what the panel says they do', async () => {
  const [source, markup] = await Promise.all([element(), template()]);

  assert.match(markup, /role="combobox"[\s\S]*?aria-controls="sf-admin-search-list"[\s\S]*?aria-activedescendant=\$\{searchActiveId \|\| nothing\}/u);
  assert.match(markup, /id="sf-admin-search-list" role="listbox"/u);
  assert.match(markup, /role="option" aria-selected=\$\{selected \? "true" : "false"\}/u);
  assert.match(source, /if \(event\.key === "ArrowDown"\)[\s\S]*?moveSearchSelection\(1\)/u);
  assert.match(source, /if \(event\.key === "ArrowUp"\)[\s\S]*?moveSearchSelection\(-1\)/u);
  assert.match(source, /if \(event\.key === "Enter"\)[\s\S]*?activateSearchSelection\(\)/u);
  assert.match(source, /if \(event\.key === "Escape"\)[\s\S]*?closeSearchPanel\(\)/u);
  // The arrows wrap, so a list of three rows does not trap the selection at
  // either end.
  assert.match(source, /const next = \(index \+ step \+ rows\.length\) % rows\.length;/u);
  // Escape and the arrow both leave by the way they came in.
  // Closing gives the focus back, and it has somewhere to give it to: the
  // opener, else the magnifier, else the back row of the submenu standing
  // behind the panel — the main menu is inert while a submenu is open, so the
  // first two are unreachable there and a plain magnifier fallback loses the
  // focus to the body.
  assert.match(source, /this\.scheduleNavigationFocus\(\(\) => this\.getSearchReturnTarget\(returnFocus\)\)/u);
  const returnTarget = source.slice(source.indexOf("getSearchReturnTarget(returnFocus = null)"));
  assert.match(returnTarget, /isAvailableNavigationTarget\(returnFocus\)\) return returnFocus/u);
  assert.match(returnTarget, /const toggle = this\.getSearchToggle\(\)/u);
  assert.match(returnTarget, /\.sf-admin-menu-panel-sub\.open/u);
  assert.match(returnTarget, /querySelector\("\.sf-admin-menu-back"\)/u);
  assert.match(markup, /<kbd class="sf-admin-menu-search-kbd">Esc<\/kbd>/u);
  assert.match(markup, /class="sf-admin-menu-search-keys flex-none">\$\{context\.searchKeysHint\}/u);
});

test('the shortcut is an attribute a host can turn off', async () => {
  const source = await element();

  assert.match(source, /searchShortcut: \{attribute: "search-shortcut", default: "mod\+k"\}/u);
  assert.match(source, /const text = String\(value \?\? ""\)\.trim\(\)\.toLowerCase\(\);\s*if \(!text\) return null;/u, 'empty turns it off');
  assert.match(source, /mod: parts\.includes\("mod"\)/u, 'and mod is Ctrl or Command, whichever the person has');
  assert.match(source, /event\.ctrlKey \|\| event\.metaKey/u);
  assert.match(source, /if \(!this\.isSearchPanelMode\(\)\) return this;/u, 'the key is only taken in panel mode');
  // A page-wide key is released when the menu leaves the page.
  assert.match(source, /unbindSearchShortcut\(\) \{[\s\S]*?document\.removeEventListener\("keydown", this\._searchShortcutBound\)/u);
});

test('an empty query shows what there is, and a waiting host shows two rows of nothing', async () => {
  const [markup, css] = await Promise.all([template(), styles()]);

  // Only a typed query waits for the host: an empty field shows the recent
  // list the host set, and waiting rows there would be waiting for nothing.
  assert.match(markup, /\$\{searchQuery && searchPending \? renderSearchSkeletons\(\) : nothing\}/u);
  assert.match(markup, /const groups = searchQuery \? searchGroups \|\| \[\] : searchRecent \|\| \[\];/u);
  assert.match(markup, /renderSearchSkeletons\(\) \{[\s\S]*?aria-hidden="true"[\s\S]*?sf-admin-menu-search-skeleton/u, 'they are not results');
  assert.match(markup, /\$\{menuText\("nothingFound"\)\} «\$\{searchQuery\}»/u);
  assert.match(markup, /context\.searchHint/u, 'and a host may put a line under an empty query');
  // The shimmer holds still for a person who asked for less motion.
  assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.sf-admin-menu-search-skeleton \{\s*animation: none;/u);
});
