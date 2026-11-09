import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';

// The package probes import playwright from this folder's own pinned
// devDependency, linked into the overlay, never from a copy above the
// repository (a shared ~/node_modules copy vanished on 2026-11-08 and failed
// every probe). The suite runs in the overlay; the package folder is
// SF_PACKAGE_ROOT (scripts/test.mjs).
const root = resolve(import.meta.dirname, '..');
const packageRoot = resolve(process.env.SF_PACKAGE_ROOT ?? join(root, '..'));
const local = join(packageRoot, 'scripts', 'playwright-local.mjs');
const {declaredPlaywright, ensurePackagePlaywright, linkOverlayPlaywright} = await import(pathToFileURL(local).href);

test('playwright is a pinned devDependency of the package, locked, at the version ui-source pins', () => {
  const declared = declaredPlaywright(packageRoot);
  assert.match(declared, /^\d+\.\d+\.\d+$/u, 'an exact version, not a range');
  const lock = readFileSync(join(packageRoot, 'yarn.lock'), 'utf8');
  assert.ok(lock.includes(`\nplaywright@${declared}:\n  version "${declared}"`), 'yarn.lock holds the declared version');
  assert.ok(lock.includes(`\nplaywright-core@${declared}:\n`), 'yarn.lock holds its core at the same version');
  // The overlay is ui-source at the pinned revision: its package.json is the one
  // ui-source's own first-paint tool checks the overlay's playwright against.
  const free = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).devDependencies?.playwright;
  if (free) assert.equal(declared, free, 'the package pins the playwright the pinned ui-source declares');
});

test('every package probe runner links the overlay\'s playwright before a probe', () => {
  for (const script of ['run-browser-probes.mjs', 'run-first-paint.mjs', 'run-manifest-probes.mjs']) {
    const source = readFileSync(join(packageRoot, 'scripts', script), 'utf8');
    assert.match(source, /linkOverlayPlaywright\(overlay\)/u, script);
    assert.doesNotMatch(source, /\/Users\/[^/]+\/node_modules/u, `${script} names no shared node_modules`);
  }
});

// A repository with components/ (a stand-in playwright, read only through its
// package.json), a worktree of it and an overlay folder, in a temporary folder.
function fixture(installed) {
  const base = mkdtempSync(join(tmpdir(), 'package-playwright-'));
  const main = join(base, 'main');
  const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], {stdio: 'ignore'});
  mkdirSync(join(main, 'components'), {recursive: true});
  git(main, 'init', '-q');
  writeFileSync(join(main, 'components', 'package.json'), JSON.stringify({private: true, devDependencies: {playwright: '9.9.9'}}));
  writeFileSync(join(main, '.gitignore'), 'node_modules\n');
  git(main, 'add', '-A');
  git(main, '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '-m', 'fixture');
  if (installed) {
    mkdirSync(join(main, 'components', 'node_modules', 'playwright'), {recursive: true});
    writeFileSync(join(main, 'components', 'node_modules', 'playwright', 'package.json'), JSON.stringify({
      name: 'playwright', version: installed, exports: {'./package.json': './package.json'},
    }));
  }
  const worktree = join(base, 'worktree');
  git(main, 'worktree', 'add', '-q', '--detach', worktree);
  const overlay = join(base, 'overlay');
  mkdirSync(join(overlay, 'tests', 'browser'), {recursive: true});
  return {base, main: join(main, 'components'), worktree: join(worktree, 'components'), overlay};
}

test('the overlay links the package\'s playwright; a worktree borrows the main checkout\'s', (t) => {
  const {base, main, worktree, overlay} = fixture('9.9.9');
  t.after(() => rmSync(base, {recursive: true, force: true}));
  const found = linkOverlayPlaywright(overlay, worktree);
  assert.equal(found.version, '9.9.9');
  assert.ok(lstatSync(join(worktree, 'node_modules')).isSymbolicLink(), 'the worktree borrows');
  assert.ok(lstatSync(join(overlay, 'node_modules')).isSymbolicLink(), 'the overlay links');
  assert.equal(realpathSync(join(overlay, 'node_modules')), realpathSync(join(main, 'node_modules')));
  assert.equal(found.path, realpathSync(join(main, 'node_modules', 'playwright')));
});

test('an overlay node_modules a route linked is taken at the declared version only', (t) => {
  const {base, main, overlay} = fixture(null);
  t.after(() => rmSync(base, {recursive: true, force: true}));
  mkdirSync(join(overlay, 'node_modules', 'playwright'), {recursive: true});
  const manifest = (version) => writeFileSync(join(overlay, 'node_modules', 'playwright', 'package.json'), JSON.stringify({
    name: 'playwright', version, exports: {'./package.json': './package.json'},
  }));
  manifest('9.9.9');
  assert.equal(linkOverlayPlaywright(overlay, main).version, '9.9.9');
  manifest('9.9.8');
  assert.throws(() => linkOverlayPlaywright(overlay, main), /holds playwright 9\.9\.8, package\.json declares 9\.9\.9/u);
});

test('a missing or different playwright stops the run with what to do', (t) => {
  const missing = fixture(null);
  const other = fixture('9.9.8');
  t.after(() => {
    rmSync(missing.base, {recursive: true, force: true});
    rmSync(other.base, {recursive: true, force: true});
  });
  assert.throws(() => linkOverlayPlaywright(missing.overlay, missing.worktree), /is not installed in .*yarn install --frozen-lockfile/u);
  assert.equal(existsSync(join(missing.worktree, 'node_modules')), false, 'nothing is borrowed when the main checkout has none');
  assert.equal(existsSync(join(missing.overlay, 'node_modules')), false, 'nothing is linked when the package has none');
  assert.throws(() => ensurePackagePlaywright(other.main), /playwright 9\.9\.8 is installed in .*declares 9\.9\.9/u);
  assert.equal(existsSync(join(other.worktree, 'node_modules')), false, 'a different version is not borrowed');
  // A copy above the repository is never what a probe gets.
  cpSync(join(other.main, 'node_modules'), join(other.base, 'node_modules'), {recursive: true});
  assert.throws(() => linkOverlayPlaywright(other.overlay, other.worktree), /is not installed/u);
});
