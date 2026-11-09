// The package browser probes import `playwright`, and Node resolves a bare
// import by walking up from the importing file: from the overlay
// (<overlay>/tests/browser/*.browser.mjs) up through this folder, the repository
// and every folder above it. Nothing here used to declare playwright, so the
// walk ended in a shared ~/node_modules copy nobody declared; when that copy
// vanished every probe failed with ERR_MODULE_NOT_FOUND, which reads exactly like
// a page of product failures (2026-11-08).
//
// Playwright is a pinned devDependency of this folder now (package.json,
// yarn.lock; `yarn install --frozen-lockfile` here), at the version ui-source
// pins. Before a probe runs, linkOverlayPlaywright gives the overlay a
// node_modules of its own, so the nearest node_modules wins and no copy above
// the repository is ever reached:
// - an overlay that already holds a node_modules (a route that links its own
//   pinned copy) is taken when it holds the declared version;
// - otherwise the overlay's node_modules is a link to this folder's.
// A git worktree whose components/ holds no node_modules borrows the main
// checkout's components/node_modules through a symlink, when that holds the
// declared version (as ui-source's scripts/playwright-local.mjs does).
//
// Browsers are not downloaded with the package: they live in
// PLAYWRIGHT_BROWSERS_PATH (the release route uses <GitHub>/.playwright-browsers,
// because the shared ~/Library/Caches/ms-playwright is pruned by other tools'
// installs).
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, realpathSync, symlinkSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const versionAt = (modules) => {
  const manifest = join(modules, 'playwright', 'package.json');
  return existsSync(manifest) ? JSON.parse(readFileSync(manifest, 'utf8')).version : null;
};

// The main checkout's copy of `root` (this folder in the repository a worktree
// was made from), or null outside a worktree.
const mainCopy = (root) => {
  try {
    const run = (...args) => execFileSync('git', ['-C', root, 'rev-parse', ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
    const top = run('--show-toplevel');
    const main = dirname(run('--path-format=absolute', '--git-common-dir'));
    // git answers with real paths (/private/var for /var on macOS).
    return resolve(main) === resolve(top) ? null : join(main, relative(top, realpathSync(root)));
  } catch {
    return null;
  }
};

export const declaredPlaywright = (root = PACKAGE_ROOT) => {
  const declared = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).devDependencies?.playwright;
  if (!declared) throw new Error(`${join(root, 'package.json')} declares no playwright devDependency`);
  return declared;
};

// {version, modules} of this folder's own playwright, or throws a sentence
// saying what to do.
export const ensurePackagePlaywright = (root = PACKAGE_ROOT) => {
  const declared = declaredPlaywright(root);
  const modules = join(root, 'node_modules');
  if (!existsSync(modules)) {
    const main = mainCopy(root);
    if (main && versionAt(join(main, 'node_modules')) === declared) symlinkSync(join(main, 'node_modules'), modules, 'dir');
  }
  const version = versionAt(modules);
  if (!version) {
    throw new Error(`playwright ${declared} is not installed in ${modules}: run \`yarn install --frozen-lockfile\` in ${root} (or in the main checkout's components/ a worktree borrows from)`);
  }
  if (version !== declared) {
    throw new Error(`playwright ${version} is installed in ${modules}, package.json declares ${declared}: run \`yarn install --frozen-lockfile\` in ${root}`);
  }
  return {version, modules: realpathSync(modules)};
};

// Gives the overlay a node_modules holding the declared playwright and proves a
// probe in it resolves there. Returns {version, path}.
export const linkOverlayPlaywright = (overlay, root = PACKAGE_ROOT) => {
  const declared = declaredPlaywright(root);
  const modules = join(overlay, 'node_modules');
  if (!existsSync(modules)) symlinkSync(ensurePackagePlaywright(root).modules, modules, 'dir');
  const version = versionAt(modules);
  if (version !== declared) {
    throw new Error(`${modules} holds playwright ${version ?? 'none'}, package.json declares ${declared}: remove it, or run \`yarn install --frozen-lockfile\` in ${root}`);
  }
  const found = createRequire(join(overlay, 'tests', 'browser', 'probe.mjs')).resolve('playwright/package.json');
  if (!realpathSync(found).startsWith(realpathSync(modules) + sep)) {
    throw new Error(`a probe in ${overlay} resolves playwright to ${found}, not ${modules}`);
  }
  return {version, path: dirname(realpathSync(found))};
};
