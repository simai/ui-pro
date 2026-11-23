// The editor folder is frozen in ui-pro (sets split plan 2026-11-05, section 6,
// the duplicate-shipping window), as the view folders are
// (view-folders-frozen.contract.test.mjs).
//
// sf-editor moved to the editor set: its source is simai/ui-editor, released
// as editor-6b1736f863ee (@simai-studio/editor 1.1.1, ui-editor tag
// editor-6b1736f863ee; earlier editor-f142dcfc53ca, editor-0893d3077342, editor-8057e7b4beb2, package/src/smart/editor). Until the next pro bundle
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

// editor-6b1736f863ee: `git -C ui-editor rev-parse editor-6b1736f863ee:package/src/smart/<folder>`.
const RELEASE = 'editor-6b1736f863ee';
const FROZEN = {
  'editor': '40c91f0c7a26342304e9f997c9f5a067422589c3',
};

// A folder may carry a patch the release does not have yet, made here ahead of
// simai/ui-editor because a pair needs it before the next editor release
// (as view-folders-frozen.contract.test.mjs allows for the view folders). The
// patched tree is the one held; the patch is named so the next editor release
// takes it.
// Over ui-078a4b4c6f6e (2026-11-16), sf-editor 1.2.6: the rule relates
// cl-empty-state (lazy), which the pair's pro.package.json requires of
// cl-editor since ui-source 64e639814 (sf-editor draws sf-empty-state as the
// Composition fragment boundary's error state); without it the package
// receipt refuses the build. simai/ui-editor takes the same relation.
// Over group build 9 (ui-source 3d55e44d7, 2026-11-17), sf-editor 1.3.2 (above
// ui-editor main's 1.3.1): the first-paint snapshots retaken over the group
// build; the patch for simai/ui-editor is ui-control
// control/evidence/2026-11-17-pro-over-gb9/editor-gb9.patch.
// Over ui-dc9fc39aeb26 (ui-source 1dd18375c, 2026-11-18), sf-editor 1.3.3:
// the keys in the platform's marks through the sf-kbd helper (rule C04, docs
// round 4 DF-12) and the first-paint snapshots retaken over the pair; the patch
// for simai/ui-editor is ui-control control/evidence/2026-11-18-df10-pro/editor-df12.patch.
const PATCHED = {
// Over ui-9ceecc24c988 (ui-source e7ea89e07, 2026-11-21), sf-editor 1.4.0: the
// library favourites star is an sf-button-icon toggle (C393); simai/ui-editor
// needs the same (ui-control control/evidence/2026-11-21-pro-gb15/editor-gb15.patch).
// Over ui-b4f79e1c58b7 (ui-source e59dbad1c, 2026-11-23), sf-editor 1.5.1 (above the
// Editor set's 1.5.0): smart.manifest.json as the pair's generate-component-files
// writes it; simai/ui-editor regenerates the same when it takes the pair.
  'editor': {tree: '7f9a6de54ab7b420065064d2cd8604f4b2480668', patch: 'cl-empty-state relation, sf-editor 1.2.6 (2026-11-16); over group build 9 (ui-source 3d55e44d7), first-paint snapshots retaken, sf-editor 1.3.2 (2026-11-17); keys through sf-kbd (C04, DF-12) and snapshots over ui-dc9fc39aeb26, sf-editor 1.3.3 (2026-11-18); over ui-9ceecc24c988 (ui-source e7ea89e07), the library favourites star as a toggle (C393) and first-paint snapshots retaken, sf-editor 1.4.0 (2026-11-21); over ui-b4f79e1c58b7 (ui-source e59dbad1c), smart.manifest.json as the pair generates it (setParameter value untyped), sf-editor 1.5.1 (2026-11-23)'},
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
  test(`src/smart/${folder} is the editor release ${RELEASE}${patched ? ` with the patch ${patched.patch}` : ', unchanged'}`, () => {
    const actual = treeOf(join(root, 'src', 'smart', folder)).toString('hex');
    assert.equal(actual, expected,
      `src/smart/${folder} differs from the editor set release ${RELEASE} (tree ${expected}${patched ? `, the release ${released} with the patch ${patched.patch}` : ''}). `
      + 'The editor folder is frozen in ui-pro: changes to sf-editor go to simai/ui-editor (package/src/smart), '
      + 'are released there, and come into pro with the next editor release. '
      + 'Revert the change here and make it in simai/ui-editor.');
  });
}
