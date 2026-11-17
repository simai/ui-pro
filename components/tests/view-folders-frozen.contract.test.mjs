// The view folders are frozen in ui-pro (sets split plan 2026-11-05, section 6,
// the duplicate-shipping window; C288: ui-pro stops writing set components).
//
// sf-view, sf-view-table and sf-view-properties belong to the view set: their
// source is simai/ui-view (package/src/smart/<folder>), released there. Until
// the pro bundle takes them from a view release, ui-pro ships copies of the
// three folders, and the copies must be one view release's tree exactly: a
// change made here would ship in pro and not in view, and the next take would
// silently drop it. There is no patch door: a change goes to simai/ui-view,
// is released there and comes into pro with the take (view round 1 B1, VW-3,
// draft set standard §5.4-5.6).
//
// The anchor is the view release the copies are. It is written in the commit
// that takes a release (its id, version and the folders' tree ids). Before the
// release, on the take's branch, the anchor names the candidate instead: a
// ref of simai/ui-view whose package/src/smart folders the copies must equal,
// read from a ui-view checkout (UI_VIEW_ROOT, else ../ui-view beside this
// repository's checkout). The anchor may lag the set's latest release by one
// release at most; older fails, so pro cannot keep shipping an old view.
//
// The guard computes the git tree id of each folder as it is on disk (the
// working tree, so an uncommitted edit fails too) and compares it with the
// anchor's. Git computes the same id for the same files, names and modes, so
// equal ids mean equal folders.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, lstatSync, readdirSync, readFileSync, readlinkSync} from 'node:fs';
import {join, resolve} from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const FOLDERS = ['view', 'view-table', 'view-properties'];

// The candidate of view round 1 (target view 1.9.0 over pair ui-24d64b7f6eb7).
// After the release: {release: 'view-<12>', version: '1.9.0', trees: {<folder>: <tree id>}}.
const ANCHOR = {candidate: 'origin/round/view-r1', version: '1.9.0'};

const packageRoot = resolve(process.env.SF_PACKAGE_ROOT ?? join(root, '..'));
const viewRoot = resolve(process.env.UI_VIEW_ROOT ?? join(packageRoot, '..', '..', 'ui-view'));
const viewGit = (...args) => execFileSync('git', ['-C', viewRoot, ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
const haveView = existsSync(join(viewRoot, '.git'));
const anchorName = ANCHOR.release ?? `the candidate ${ANCHOR.candidate} (view ${ANCHOR.version})`;
const expectedTree = (folder) => {
  if (ANCHOR.trees) return ANCHOR.trees[folder];
  if (!haveView) throw new Error(`the anchor is a candidate: set UI_VIEW_ROOT to a simai/ui-view checkout (looked in ${viewRoot})`);
  return viewGit('rev-parse', `${ANCHOR.candidate}:package/src/smart/${folder}`);
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

for (const folder of FOLDERS) {
  test(`src/smart/${folder} is the view anchor, ${anchorName}, unchanged`, () => {
    const expected = expectedTree(folder);
    const actual = treeOf(join(root, 'src', 'smart', folder)).toString('hex');
    assert.equal(actual, expected,
      `src/smart/${folder} differs from ${anchorName} (tree ${expected}). `
      + 'The view folders are frozen in ui-pro: changes to sf-view, sf-view-table and sf-view-properties go to '
      + 'simai/ui-view (package/src/smart), are released there, and come into pro with the take of that release. '
      + 'Revert the change here and make it in simai/ui-view.');
  });
}

const semver = (version) => version.split('.').map(Number);
const newer = (a, b) => (semver(a).map((part, index) => part - semver(b)[index]).find((delta) => delta !== 0) ?? 0) > 0;

test('the anchor is the set\'s latest release or the one before it', (t) => {
  if (!haveView) { t.skip(`no simai/ui-view checkout at ${viewRoot} (UI_VIEW_ROOT) to read the set's releases`); return; }
  let ref = 'origin/main';
  try { viewGit('rev-parse', '--verify', '--quiet', ref); } catch { ref = 'HEAD'; }
  const releases = viewGit('ls-tree', '--name-only', `${ref}:contracts/releases`).split('\n').filter((name) => /^view-[0-9a-f]{12}\.lock\.json$/u.test(name))
    .map((name) => JSON.parse(viewGit('show', `${ref}:contracts/releases/${name}`)).version);
  const ahead = releases.filter((version) => newer(version, ANCHOR.version));
  assert.ok(ahead.length <= 1, `the anchor view ${ANCHOR.version} is ${ahead.length} releases behind the set (${ahead.sort().join(', ')}); take the latest view release`);
});

test('the tree id is git\'s own (a known tree computes to its id)', () => {
  // Guards the hashing itself: an empty tree is git's well-known id.
  assert.equal(object('tree', Buffer.alloc(0)).toString('hex'), '4b825dc642cb6eb9a060e54bf8d69288fbee4904');
});
