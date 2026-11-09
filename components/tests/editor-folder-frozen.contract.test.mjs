// The editor folder is frozen in ui-pro (sets split plan 2026-11-05, section 6,
// the duplicate-shipping window), as the view folders are
// (view-folders-frozen.contract.test.mjs).
//
// sf-editor moved to the editor set: its source is simai/ui-editor, released
// as editor-f142dcfc53ca (@simai-studio/editor 1.1.0, ui-editor tag
// editor-f142dcfc53ca; earlier editor-0893d3077342, editor-8057e7b4beb2, package/src/smart/editor). Until the next pro bundle
// takes it from that release, ui-pro still ships its own copy of the folder,
// and it must stay the release's tree exactly: a change made here would ship
// in pro and not in the editor set, and the next bundle would silently drop it.
//
// The guard computes the git tree id of the folder as it is on disk (the
// working tree, so an uncommitted edit fails too) and compares it with the
// tree id of the same folder in the editor release. Git computes the same id
// for the same files, names and modes, so equal ids mean equal folders.
//
// To change sf-editor: change it in simai/ui-editor, release the editor set,
// and take the release into pro (the bundle, or a copy of the released folder
// with the new tree id below, in one commit).
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync, readdirSync, readFileSync, readlinkSync} from 'node:fs';
import {join, resolve} from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');

// editor-f142dcfc53ca: `git -C ui-editor rev-parse editor-f142dcfc53ca:package/src/smart/<folder>`.
const RELEASE = 'editor-f142dcfc53ca';
const FROZEN = {
  'editor': '827827cdea1ea8f0e5815e04e29826948815c489',
};

// What git ignores here (.gitignore of this repository) is not part of a tree.
const IGNORED = new Set(['.DS_Store', 'node_modules']);

const object = (type, body) => {
  const hash = createHash('sha1');
  hash.update(`${type} ${body.length}\0`);
  hash.update(body);
  return hash.digest();
};

// The git tree id of a directory on disk: blobs and subtrees, sorted the way
// git sorts tree entries (a directory's name compares as if it ended in "/").
const treeOf = (directory) => {
  const entries = readdirSync(directory, {withFileTypes: true})
    .filter((entry) => !IGNORED.has(entry.name))
    .map((entry) => {
      const path = join(directory, entry.name);
      const stat = lstatSync(path);
      if (stat.isDirectory()) return {name: entry.name, key: `${entry.name}/`, mode: '40000', id: treeOf(path)};
      if (stat.isSymbolicLink()) return {name: entry.name, key: entry.name, mode: '120000', id: object('blob', Buffer.from(readlinkSync(path)))};
      return {name: entry.name, key: entry.name, mode: stat.mode & 0o111 ? '100755' : '100644', id: object('blob', readFileSync(path))};
    })
    .sort((a, b) => Buffer.compare(Buffer.from(a.key), Buffer.from(b.key)));
  const body = Buffer.concat(entries.flatMap((entry) => [Buffer.from(`${entry.mode} ${entry.name}\0`), entry.id]));
  return object('tree', body);
};

for (const [folder, expected] of Object.entries(FROZEN)) {
  test(`src/smart/${folder} is the editor release ${RELEASE}, unchanged`, () => {
    const actual = treeOf(join(root, 'src', 'smart', folder)).toString('hex');
    assert.equal(actual, expected,
      `src/smart/${folder} differs from the editor set release ${RELEASE} (tree ${expected}). `
      + 'The editor folder is frozen in ui-pro: changes to sf-editor go to simai/ui-editor (package/src/smart), '
      + 'are released there, and come into pro with the next editor release. '
      + 'Revert the change here and make it in simai/ui-editor.');
  });
}
