// The view folders are frozen in ui-pro (sets split plan 2026-11-05, section 6,
// the duplicate-shipping window).
//
// sf-view, sf-view-table and sf-view-properties moved to the view set: their
// source is simai/ui-view, released as view-23ed2acf30d7 (@simai-studio/view
// 1.6.0, ui-view tag view-23ed2acf30d7, package/src/smart/<folder>; earlier
// releases view-aea031ba718b, view-99763f547560, view-99c8dd1585fd, view-4d7070623fe1, view-9c963d217188, view-f529c2354b0d and
// view-cd0d82aeb756; view-a79198bb298c was prepared, never published). Until the next pro bundle takes them from that
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

// view-23ed2acf30d7: `git -C ui-view rev-parse view-23ed2acf30d7:package/src/smart/<folder>`.
const RELEASE = 'view-23ed2acf30d7';
const FROZEN = {
  'view': '559ece8cef89443ee9e7d8c2124bef71b2ddb038',
  'view-table': '24bc7fb6eff2ecfeca56b3efc41946176e22a39c',
  'view-properties': '59c2eaf203e1c5067ba81c7694934536d072805c',
};

// A change made here ahead of the view set: one folder, one named patch. The
// folder must be the release's tree with exactly that patch, and simai/ui-view
// releases the same change before the next take (the take then drops the entry
// here). sf-view-properties: decision C22 -- the panel writes a size on the
// controls it draws only when the host has one, as sf-view and sf-view-table do
// since view 1.6.0; with size 1 written on them they stayed 40 under compact
// density beside the page's 32. Dispatcher order 2026-11-10 (pro over
// ui-a0370c0c99fb); the patch for simai/ui-view (index.js, the template, component.json) is
// ui-control control/evidence/2026-11-10-pro-next-1110/view-properties-c22.patch.
const PATCHED = {
  'view-properties': {tree: '660b9268c96af4a120e7c35c2b207d9e3d8090fc', patch: 'C22 control size, sf-view-properties 1.13.3 (2026-11-10)'},
  // sf-view-table: the pinned-column edge shadow reads --sf-surface-state-select,
  // not --sf-alpha-8; over ui-7fb26d395af2 the Framework's alpha-scale contract
  // refuses a component that reads --sf-alpha-* (DEV acceptance 2026-11-10 Q3).
  // Pro over ui-7fb26d395af2, 2026-11-12; the patch for simai/ui-view is
  // ui-control control/evidence/2026-11-12-pro-over-7fb26d395af2/view-table-alpha.patch.
  'view-table': {tree: '92c5e6217cbce2e9460f52263948f47f4288b6df', patch: 'surface role for the pin shadow, sf-view-table 1.17.1 (2026-11-12)'},
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

for (const [folder, released] of Object.entries(FROZEN)) {
  const patched = PATCHED[folder];
  const expected = patched?.tree ?? released;
  test(`src/smart/${folder} is the view release ${RELEASE}${patched ? ` with the patch ${patched.patch}` : ', unchanged'}`, () => {
    const actual = treeOf(join(root, 'src', 'smart', folder)).toString('hex');
    assert.equal(actual, expected,
      `src/smart/${folder} differs from the view set release ${RELEASE} (tree ${expected}${patched ? `, the release ${released} with the patch ${patched.patch}` : ''}). `
      + 'The view folders are frozen in ui-pro: changes to sf-view, sf-view-table and sf-view-properties go to '
      + 'simai/ui-view (package/src/smart), are released there, and come into pro with the next view release. '
      + 'Revert the change here and make it in simai/ui-view.');
  });
}

test('the tree id is git\'s own (a known tree computes to its id)', () => {
  // Guards the hashing itself: an empty tree is git's well-known id.
  assert.equal(object('tree', Buffer.alloc(0)).toString('hex'), '4b825dc642cb6eb9a060e54bf8d69288fbee4904');
});
