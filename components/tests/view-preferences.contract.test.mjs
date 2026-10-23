import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import test from 'node:test';

// A component that keeps how it looks keeps it through SF.Preferences
// (owner, 2026-10-14): one store, written for the person when the host keeps
// preferences, read before the first paint. Two exceptions, both on their way
// out: the admin menu's older `items` menu (retired when Larena has switched
// to the navigation port) and the one-time reads of what a browser kept
// before the standard.
const LEGACY = [
  {file: 'smart/admin-menu/index.js', why: 'the items menu, retired with it'},
  {file: 'smart/admin-menu/js/navigation/controller.js', line: /rootMemoryKey\(\)/u, why: 'a root kept before the standard, taken over once'},
];

test('no component touches localStorage outside SF.Preferences', async () => {
  // The package's own components: the tests run in the overlay, where the
  // Framework's source lies under the same folder (its own contract checks it).
  const root = new URL('../src/', import.meta.url).pathname;
  const own = ['smart/admin-menu', 'smart/data-view', 'smart/property-view', 'smart/table'];
  const offenders = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, {withFileTypes: true})) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { await walk(path); continue; }
      if (!/\.m?js$/u.test(entry.name)) continue;
      const relative = path.slice(root.length);
      const legacy = LEGACY.find((item) => item.file === relative);
      const lines = (await readFile(path, 'utf8')).split('\n')
        .filter((line) => /localStorage/u.test(line) && !/^\s*\/\//u.test(line))
        .filter((line) => !legacy || (legacy.line && !legacy.line.test(line)));
      if (legacy && !legacy.line) continue;
      if (lines.length) offenders.push(`${relative}: ${lines.length}`);
    }
  };
  for (const folder of own) await walk(join(root, folder));
  assert.deepEqual(offenders, []);
});

test('the table, the data view and the menu keep their view through SF.Preferences', async () => {
  const read = (file) => readFile(new URL(`../src/smart/${file}`, import.meta.url), 'utf8');
  const [table, view, menu] = await Promise.all([read('table/index.js'), read('data-view/index.js'), read('admin-menu/js/navigation/controller.js')]);
  for (const [name, source] of [['table', table], ['data view', view], ['menu', menu]]) {
    assert.match(source, /globalThis\.SF\?\.Preferences \|\| BundledPreferences/u, `${name} reads the shared store`);
  }
  assert.match(table, /get viewPreferenceKey\(\)/u);
  assert.match(view, /_keepPreference\(\{sort\}\)/u);
  assert.match(menu, /MENU_PREFERENCE = "sf-admin-menu\/main"/u);
});
