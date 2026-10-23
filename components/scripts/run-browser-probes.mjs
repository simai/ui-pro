#!/usr/bin/env node
// Usage: node scripts/run-browser-probes.mjs <free build output> <package build output> [--overlay <directory>]
//
// Runs every package browser probe (tests/browser/*.browser.mjs of this
// repository) against the package bytes laid into the free Framework they were
// built against: the free output is the directory holding core/, component/,
// utility/ and smart/ (wave-1/output of ui-builder's
// verify-product-reproducibility.cjs for the pinned ui-source revision), the
// package output the one holding smart/ (wave-1/output/package/larena of
// verify-package-reproducibility.cjs). The two are combined into one output root
// with the package folders and the package rule file in smart/smart, and each
// probe gets the roots it asks for, read from the sentence it throws when it is
// not given them (as ui-source's scripts/run-browser-probes.mjs does).
//
// The probes run from the overlay (scripts/overlay.mjs; default .overlay/,
// made by scripts/test.mjs or here when absent), so their fixtures and imports
// resolve as they did in ui-source.
import {execFileSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {PACKAGE_COMPONENTS, PACKAGE_ROOT, materializeOverlay} from './overlay.mjs';

const args = process.argv.slice(2);
const at = args.indexOf('--overlay');
const overlay = resolve(at === -1 ? join(PACKAGE_ROOT, '.overlay') : args[at + 1]);
const [freeInput, packageInput] = args.filter((value, index) => !value.startsWith('--') && (at === -1 || index !== at + 1));
if (!freeInput || !packageInput) throw new Error('usage: run-browser-probes.mjs <free build output> <package build output> [--overlay <directory>]');
const free = resolve(freeInput);
const built = resolve(packageInput);
for (const path of ['core/core/js/core.js', 'smart/smart']) {
  if (!existsSync(join(free, path))) throw new Error(`the free output has no ${path}: ${free}`);
}
for (const path of [...PACKAGE_COMPONENTS.map((name) => `smart/${name}`), 'smart/rule.js']) {
  if (!existsSync(join(built, path))) throw new Error(`the package output has no ${path}: ${built}`);
}
if (!existsSync(overlay)) materializeOverlay(overlay);

// One output root, laid out like the free one, with the package inside smart/smart.
const combined = join(overlay, '.probe-output');
rmSync(combined, {force: true, recursive: true});
mkdirSync(join(combined, 'smart'), {recursive: true});
for (const product of ['core', 'component', 'utility']) symlinkSync(join(free, product), join(combined, product));
cpSync(join(free, 'smart', 'smart'), join(combined, 'smart', 'smart'), {recursive: true});
for (const entry of readdirSync(join(built, 'smart'))) {
  const destination = join(combined, 'smart', 'smart', entry);
  if (existsSync(destination)) throw new Error(`the package output would replace the free smart/${entry}`);
  cpSync(join(built, 'smart', entry), destination, {recursive: true});
}
const roots = {
  output: combined,
  smart: join(combined, 'smart', 'smart'),
  smartParent: join(combined, 'smart'),
  core: join(combined, 'core'),
};

// Probes that drive a served lab and take URLs; not part of a build's evidence.
const needsLab = new Set(['admin-menu-position', 'composition-routing', 'loader-hidden-tab', 'table-intents', 'table-search-caret']);
const WANTS = [
  [/Smart output root and distr root/u, () => [roots.smart, roots.core]],
  [/Core and Smart output roots/u, () => [roots.core, roots.smartParent]],
  [/Smart output root is required/u, () => [roots.smart]],
  [/Build output root is required/u, () => [roots.output]],
];

const own = readdirSync(join(PACKAGE_ROOT, 'tests', 'browser')).sort();
const results = {passed: [], failed: [], skipped: [], unknown: [], cli: own.filter((name) => name.endsWith('.cli.js'))};
for (const file of own.filter((name) => name.endsWith('.browser.mjs'))) {
  const name = file.replace('.browser.mjs', '');
  if (needsLab.has(name)) { results.skipped.push(name); continue; }
  const path = join(overlay, 'tests', 'browser', file);
  const source = readFileSync(path, 'utf8');
  const wanted = WANTS.find(([pattern]) => pattern.test(source));
  if (!wanted) { results.unknown.push(name); continue; }
  try {
    execFileSync(process.execPath, [path, ...wanted[1]()], {cwd: overlay, stdio: ['ignore', 'pipe', 'pipe']});
    results.passed.push(name);
  } catch (error) {
    const said = String(error.stderr ?? '').trim().split('\n').slice(-3).join(' ') || String(error.stdout ?? '').trim().slice(-300);
    results.failed.push({name, said: said.slice(0, 400)});
  }
}

console.log(JSON.stringify({
  passed: results.passed.length,
  failed: results.failed,
  skipped: {count: results.skipped.length, why: 'these drive a served lab and take URLs', names: results.skipped},
  unknown: {count: results.unknown.length, names: results.unknown},
  cli: {count: results.cli.length, why: 'page functions against a fixture server and a published runtime; not run here'},
  unaccounted: own.filter((name) => !name.endsWith('.browser.mjs') && !name.endsWith('.cli.js')),
}, null, 1));
if (results.failed.length || results.unknown.length) process.exit(1);
