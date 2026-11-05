// The view folders are frozen in ui-pro (sets split plan 2026-11-05, section 6,
// the duplicate-shipping window).
//
// sf-view, sf-view-table and sf-view-properties moved to the view set: their
// source is simai/ui-view, released as view-9c963d217188 (ui-view 9c963d2,
// package/src/smart/<folder>). Until the next pro bundle takes them from that
// release, ui-pro still ships its own copies of the three folders, and they
// must stay the release's tree exactly: a change made here would ship in pro
// and not in view, and the next bundle would silently drop it.
//
// The guard computes the git tree id of each folder as it is on disk (the
// working tree, so an uncommitted edit fails too) and compares it with the
// tree id of the same folder in the view release. Git computes the same id
// for the same files, names and modes, so equal ids mean equal folders.
//
// To change one of these components: change it in simai/ui-view, release the
// view set, and take the release into pro (the bundle, or a copy of the
// released folders with the new tree ids below, in one commit).
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync, readdirSync, readFileSync, readlinkSync} from 'node:fs';
import {join, resolve} from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');

// view-9c963d217188: `git -C ui-view rev-parse 9c963d2:package/src/smart/<folder>`.
const RELEASE = 'view-9c963d217188';
const FROZEN = {
  'view': '030a8c344da65f5bd1ed4e9e43ae1a1f8c0ca567',
  'view-table': '6fd1c4b4e03f24ca00ccab3c76653e0806c93bc1',
  'view-properties': '0b6d0f8c4da0ed2b20a196bfbb1b20e06191d217',
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
  test(`src/smart/${folder} is the view release ${RELEASE}, unchanged`, () => {
    const actual = treeOf(join(root, 'src', 'smart', folder)).toString('hex');
    assert.equal(actual, expected,
      `src/smart/${folder} differs from the view set release ${RELEASE} (tree ${expected}). `
      + 'The view folders are frozen in ui-pro: changes to sf-view, sf-view-table and sf-view-properties go to '
      + 'simai/ui-view (package/src/smart), are released there, and come into pro with the next view release. '
      + 'Revert the change here and make it in simai/ui-view.');
  });
}

test('the tree id is git\'s own (a known tree computes to its id)', () => {
  // Guards the hashing itself: an empty tree is git's well-known id.
  assert.equal(object('tree', Buffer.alloc(0)).toString('hex'), '4b825dc642cb6eb9a060e54bf8d69288fbee4904');
});
