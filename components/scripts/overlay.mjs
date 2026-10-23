#!/usr/bin/env node
// Usage: node scripts/overlay.mjs <new directory> [--ui-source <ui-source checkout>] [--committed]
//
// Lays out the tree the larena package is built and tested in: ui-source at
// the revision framework.lock.json pins, with this repository's src/, tests/
// and docs/ laid over it. The package components import the free Framework by
// relative path (../../core/js/smart-base, ../helpers/dom,
// ../field-renderers/index.js), so in the overlay every import resolves
// unchanged, and the package tests read the same paths ui-source's tests do.
//
// ui-source comes from git (`git archive <pin>`), never from its working tree,
// so a local edit there cannot leak into a package result. This repository's files
// come from the working tree, so uncommitted package work can be tested; with
// --committed they come from HEAD (what ui-builder's product-package build builds).
//
// A package file may not replace a ui-source file: a package adds to the Framework, it
// does not shadow it. The ui-source checkout defaults to $UI_SOURCE_ROOT, else
// ../ui-source beside this repository.
import {execFileSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const OVERLAY_DIRECTORIES = ['src', 'tests', 'docs'];
export const PACKAGE_COMPONENTS = ['admin-menu', 'data-view', 'property-view', 'table'];

export function readLock(root = PACKAGE_ROOT) {
  const lock = JSON.parse(readFileSync(join(root, 'framework.lock.json'), 'utf8'));
  // Read in both forms: the name with its version, or without it and
  // schema_version beside (names carry no version, owner decision 2026-10-11).
  const lockForm = lock.schema === 'simai.framework.product-package-source-lock.v1'
    || (lock.schema === 'simai.framework.product-package-source-lock' && lock.schema_version === 1);
  if (!lockForm) throw new Error('framework.lock.json: unknown schema');
  if (lock.source?.repository !== 'simai/ui-source' || !/^[0-9a-f]{40}$/u.test(lock.source?.revision ?? '')) {
    throw new Error('framework.lock.json: source must name simai/ui-source and a full revision');
  }
  return lock;
}

const files = (root, current = root) => readdirSync(current, {withFileTypes: true})
  .flatMap((entry) => {
    const path = join(current, entry.name);
    return entry.isDirectory() ? files(root, path) : [relative(root, path)];
  });

export function materializeOverlay(target, {uiSource, committed = false} = {}) {
  // This folder lives inside ui-admin, so ui-source is looked for beside the
  // repository, not beside the folder.
  const repositoryRoot = execFileSync('git', ['-C', PACKAGE_ROOT, 'rev-parse', '--show-toplevel'], {encoding: 'utf8'}).trim();
  const sourceRoot = resolve(uiSource ?? process.env.UI_SOURCE_ROOT ?? join(repositoryRoot, '..', 'ui-source'));
  if (existsSync(target)) throw new Error(`the overlay directory must not exist: ${target}`);
  const {source} = readLock();
  try {
    execFileSync('git', ['-C', sourceRoot, 'cat-file', '-e', `${source.revision}^{commit}`], {stdio: 'pipe'});
  } catch {
    throw new Error(`${sourceRoot} does not hold ui-source ${source.revision.slice(0, 12)} (fetch it, or point --ui-source / UI_SOURCE_ROOT at a checkout that does)`);
  }
  mkdirSync(target, {recursive: true});
  execFileSync('sh', ['-c', 'git -C "$1" archive --format=tar "$2" | tar -x -C "$3"', 'overlay', sourceRoot, source.revision, target]);

  let laid = 0;
  const staging = `${target}.package`;
  rmSync(staging, {force: true, recursive: true});
  mkdirSync(staging);
  if (committed) {
    const present = OVERLAY_DIRECTORIES.filter((directory) =>
      execFileSync('git', ['-C', PACKAGE_ROOT, 'ls-tree', '--name-only', 'HEAD', directory], {encoding: 'utf8'}).trim() === directory);
    execFileSync('sh', ['-c', 'root="$1"; staging="$2"; shift 2; git -C "$root" archive --format=tar HEAD -- "$@" | tar -x -C "$staging"',
      'overlay', PACKAGE_ROOT, staging, ...present]);
  } else {
    for (const directory of OVERLAY_DIRECTORIES) {
      if (existsSync(join(PACKAGE_ROOT, directory))) cpSync(join(PACKAGE_ROOT, directory), join(staging, directory), {recursive: true});
    }
  }
  for (const path of files(staging)) {
    const destination = join(target, path);
    if (existsSync(destination)) throw new Error(`the package would replace ui-source's ${path}`);
    mkdirSync(dirname(destination), {recursive: true});
    cpSync(join(staging, path), destination);
    laid += 1;
  }
  rmSync(staging, {recursive: true});
  for (const name of PACKAGE_COMPONENTS) {
    if (!statSync(join(target, 'src', 'smart', name)).isDirectory()) throw new Error(`no src/smart/${name} in the overlay`);
  }
  return {target, sourceRoot, sourceRevision: source.revision, laid};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--ui-source');
  const uiSource = at === -1 ? undefined : args[at + 1];
  const committed = args.includes('--committed');
  const target = args.filter((value, index) => !value.startsWith('--') && (at === -1 || index !== at + 1))[0];
  if (!target) {
    process.stderr.write('usage: node scripts/overlay.mjs <new directory> [--ui-source <checkout>] [--committed]\n');
    process.exit(2);
  }
  const result = materializeOverlay(resolve(target), {uiSource, committed});
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
