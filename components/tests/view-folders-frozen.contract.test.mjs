// The view folders are frozen in ui-pro (sets split plan 2026-11-05, section 6,
// the duplicate-shipping window).
//
// sf-view, sf-view-table and sf-view-properties moved to the view set: their
// source is simai/ui-view, released as view-9eff67bbf11f (@simai-studio/view
// 1.7.1, ui-view tag view-9eff67bbf11f, package/src/smart/<folder>; earlier
// releases view-0e589597e2d9, view-23ed2acf30d7, view-aea031ba718b, view-99763f547560, view-99c8dd1585fd, view-4d7070623fe1, view-9c963d217188, view-f529c2354b0d and
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

// view-9eff67bbf11f: `git -C ui-view rev-parse view-9eff67bbf11f:package/src/smart/<folder>`.
const RELEASE = 'view-9eff67bbf11f';
const FROZEN = {
  'view': '0c4074806be12afd19c95408a193d73ba751ad36',
  'view-table': '8f132cd67a7cb8788feceb7b12c0a7a1ad6449c1',
  'view-properties': '13b3999b10133de53c18fbeba38dfb2dba7a9c0b',
};

// A change made here ahead of the view set: one folder, one named patch. The
// folder must be the release's tree with exactly that patch, and simai/ui-view
// releases the same change before the next take (the take then drops the entry
// here). The take of view-9eff67bbf11f (2026-11-15) dropped the two earlier
// entries: sf-view-properties C22 (released in view 1.6.1) and the sf-view-table
// pin shadow on a surface role (released in view 1.7.0).
const PATCHED = {
  // sf-view-table 1.18.3 (2026-11-15, pro over ui-141822273efe): the view
  // release rebuilt over that pair (smart.manifest.json's provenance of the
  // Framework files it builds in, option-badge and pagination), the published
  // box following density for a written size too (C79), and the windows'
  // footer on the menu's inset (C105 H4, C106: the table zeroed the menu's
  // inline content padding). 1.18.2 is held by unreleased simai/ui-view
  // branches. The patch for simai/ui-view is ui-control
  // control/evidence/2026-11-15-pro-fixes/view-table.patch.
  'view-table': {tree: 'f63751fc79e37c8d3a9c23f5304289bd84b0ce60', patch: 'rebuilt over ui-141822273efe, C79 published box, menu-inset footer, sf-view-table 1.18.3 (2026-11-15)'},
  // sf-view-properties 1.15.2 (2026-11-15): the panel takes back the drawer's
  // own block padding (--sf-drawer--inset, sf-drawer over ui-141822273efe),
  // and the skeleton's tab strip stands over the tabs' hairline (1px taller
  // than the tabs before). 1.14.0-1.15.1 are held by unreleased branches. The
  // patch for simai/ui-view is ui-control
  // control/evidence/2026-11-15-pro-fixes/view-properties.patch.
  'view-properties': {tree: 'a0c9b60c22c7ae8bf37bb5f9dd2daf3426d717d2', patch: 'drawer inset and skeleton tab strip, sf-view-properties 1.15.2 (2026-11-15)'},
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
