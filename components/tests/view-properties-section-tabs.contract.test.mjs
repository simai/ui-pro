// TR-13, decision C96 point 5 (sf-view-properties 1.14.0, pro patch 2026-11-12,
// ahead of simai/ui-view): the record's sections beside the groups are vertical
// tabs, not a tree. They switch which part of one record is shown -- tabs
// semantics -- and one level is not a tree; a menu column (C30) is for places
// with their own addresses, which sections are not.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const body = (source, name) => source.match(new RegExp(`\\nfunction ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}\\n`, 'u'))?.[1] ?? '';

test('reading, the section list is a named sf-tabs type="vertical" carrying the section icons', async () => {
  const template = await read('src/smart/view-properties/js/templates/default.js');
  assert.doesNotMatch(template, /<sf-tree[\s>]/u, 'no sf-tree is drawn');
  assert.doesNotMatch(template, /renderSectionTree/u);
  const list = body(template, 'renderSectionList');
  assert.match(list, /renderSectionVerticalTabs\(context, sections\)/u);
  const tabs = body(template, 'renderSectionVerticalTabs');
  assert.match(tabs, /<sf-tabs[\s\S]*type="vertical"/u);
  assert.match(tabs, /aria-label=\$\{context\.sectionsLabel\}/u, 'the tablist is named');
  assert.match(tabs, /selected=\$\{selected\}/u, 'the selected tab is named by the section key');
  assert.match(tabs, /\.items=\$\{items\}/u, 'items as data, so an icon can travel');
  assert.match(tabs, /icon: String\(section\.icon\)/u, 'a section icon is the tab icon');
  assert.doesNotMatch(tabs, /folder/u, 'no folder for a section without an icon');
  assert.match(tabs, /@sf-tabs-change=/u);
  // Arranged rows draw no folder either.
  assert.doesNotMatch(body(template, 'renderSectionTabsArranged'), /'folder'/u);
});

test('the rule and the drop target no longer name the tree', async () => {
  const rule = await read('src/smart/view-properties/rule.js');
  assert.doesNotMatch(rule, /cl-tree/u);
  assert.match(rule, /\{ name: 'cl-tabs' \}/u);
  const element = await read('src/smart/view-properties/index.js');
  assert.doesNotMatch(element, /sf-tree-item/u);
  assert.match(element, /closest\?\.\("\[data-section-tab\]"\)/u);
  const manifest = JSON.parse(await read('src/smart/view-properties/smart.manifest.json'));
  assert.equal(manifest.version, '1.14.0');
});
