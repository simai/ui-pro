import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import test from 'node:test';

// A component that keeps how it looks keeps it through SF.Preferences
// (owner, 2026-10-14): one store, written for the person when the host keeps
// preferences, read before the first paint. The admin menu, with its two
// exceptions, left for the Admin set (simai/ui-admin, 2026-11-22).
const LEGACY = [];

test('no component touches localStorage outside SF.Preferences', async () => {
  // The package's own components: the tests run in the overlay, where the
  // Framework's source lies under the same folder (its own contract checks it).
  const root = new URL('../src/', import.meta.url).pathname;
  const own = ['smart/view', 'smart/view-properties', 'smart/view-table'];
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

test('the table and the data view keep their view through SF.Preferences', async () => {
  const read = (file) => readFile(new URL(`../src/smart/${file}`, import.meta.url), 'utf8');
  const [table, view] = await Promise.all([read('view-table/index.js'), read('view/index.js')]);
  for (const [name, source] of [['table', table], ['data view', view]]) {
    assert.match(source, /globalThis\.SF\?\.Preferences \|\| BundledPreferences/u, `${name} reads the shared store`);
  }
  assert.match(table, /get viewPreferenceKey\(\)/u);
  assert.match(view, /_keepPreference\(\{sort\}\)/u);
});
