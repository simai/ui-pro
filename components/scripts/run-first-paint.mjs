#!/usr/bin/env node
// Usage: node scripts/run-first-paint.mjs snapshot|check|gate <free output> <package output> [folder ...] [--overlay <directory>]
//
// The first paint of the package components (standard simai.smart-component
// 1.3.8 §5.4, §7.3, gate 24), with ui-source's own tools at the pinned
// revision, from the overlay:
//
//   snapshot  scripts/snapshot-first-paint.mjs: renders every example from the
//             built bytes and writes src/smart/<folder>/static/ here (the
//             static markup, the skeletons, static/sheets.json);
//   check     the same with --check: fails when a committed snapshot is stale
//             or missing;
//   gate      tests/browser/first-paint-gate.browser.mjs: the first paint
//             holds still through the HTML and sheets, the code and the data,
//             at 1280 and 390 px.
//
// The free tools' page declares no package; this script gives their shared
// library the one line that does (SF_BOOT_CONFIG.packages.larena), in copies
// beside them in the overlay, and refuses to run when that line is not where
// it was (the tools moved on and this script must follow). The outputs are
// combined as scripts/run-manifest-probes.mjs combines them.
import {spawnSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {PACKAGE_COMPONENTS, PACKAGE_ROOT, materializeOverlay} from './overlay.mjs';

const args = process.argv.slice(2);
const at = args.indexOf('--overlay');
const overlay = resolve(at === -1 ? join(PACKAGE_ROOT, '.overlay') : args[at + 1]);
const [mode, freeInput, packageInput, ...folders] = args.filter((value, index) => !value.startsWith('--') && (at === -1 || index !== at + 1));
if (!['snapshot', 'check', 'gate'].includes(mode) || !freeInput || !packageInput) {
  throw new Error('usage: run-first-paint.mjs snapshot|check|gate <free output> <package output> [folder ...] [--overlay <directory>]');
}
const free = resolve(freeInput);
const built = resolve(packageInput);
if (!existsSync(join(built, 'smart', 'rule.js'))) throw new Error(`the package output has no smart/rule.js: ${built}`);
if (!existsSync(overlay)) materializeOverlay(overlay);
const own = folders.length ? folders : PACKAGE_COMPONENTS;
for (const folder of own) if (!PACKAGE_COMPONENTS.includes(folder)) throw new Error(`${folder} is not a package component`);

// One output root in the product layout, the package inside smart/smart.
const products = {core: ['core', 'core'], rule: ['core', 'rule'], component: ['component', 'component'], smart: ['smart', 'smart'], utility: ['utility', 'utility']};
const layout = existsSync(join(free, 'core', 'core', 'js', 'core.js')) ? 'product' : existsSync(join(free, 'core', 'js', 'core.js')) ? 'distr' : '';
if (!layout) throw new Error(`no core/js/core.js under ${free} (a product output root or a ui distr)`);
const combined = join(overlay, '.first-paint-output');
rmSync(combined, {force: true, recursive: true});
for (const [product, [folder, inner]] of Object.entries(products)) {
  const from = layout === 'product' ? join(free, folder, inner) : join(free, product);
  if (!existsSync(from)) throw new Error(`the free output has no ${product}: ${free}`);
  mkdirSync(join(combined, folder), {recursive: true});
  if (product === 'smart') cpSync(from, join(combined, folder, inner), {recursive: true});
  else symlinkSync(from, join(combined, folder, inner));
}
for (const entry of readdirSync(join(built, 'smart'))) {
  const destination = join(combined, 'smart', 'smart', entry);
  if (existsSync(destination)) throw new Error(`the package output would replace the free smart/${entry}`);
  cpSync(join(built, 'smart', entry), destination, {recursive: true});
}

// The free tools, their library declaring the package.
const copy = (from, to, replacements) => {
  let text = readFileSync(join(overlay, from), 'utf8');
  for (const [anchor, next] of replacements) {
    if (text.split(anchor).length !== 2) throw new Error(`${from}: "${anchor.slice(0, 60)}" moved; this script must follow it`);
    text = text.replace(anchor, () => next);
  }
  writeFileSync(join(overlay, to), text);
};
copy('scripts/first-paint-lib.mjs', 'scripts/.first-paint-lib.package.mjs', [
  ["  preloader: {enabled: false},\n};", "  preloader: {enabled: false},\n  packages: {larena: {base: '/distr/smart/'}},\n};"],
]);
copy('scripts/first-paint-skeleton.mjs', 'scripts/.first-paint-skeleton.package.mjs', [
  ["from './first-paint-lib.mjs';", "from './.first-paint-lib.package.mjs';"],
]);
copy('scripts/snapshot-first-paint.mjs', 'scripts/.snapshot-first-paint.package.mjs', [
  ["from './first-paint-lib.mjs';", "from './.first-paint-lib.package.mjs';"],
  ["from './first-paint-skeleton.mjs';", "from './.first-paint-skeleton.package.mjs';"],
]);
copy('tests/browser/first-paint-gate.browser.mjs', 'tests/browser/.first-paint-gate.package.browser.mjs', [
  ["from '../../scripts/first-paint-lib.mjs';", "from '../../scripts/.first-paint-lib.package.mjs';"],
]);

const tool = mode === 'gate' ? 'tests/browser/.first-paint-gate.package.browser.mjs' : 'scripts/.snapshot-first-paint.package.mjs';
const result = spawnSync(process.execPath, [tool, combined, ...own, ...(mode === 'check' ? ['--check'] : [])], {cwd: overlay, stdio: 'inherit'});

// A snapshot is written in the overlay's folders; it belongs to this repository's.
if (mode === 'snapshot') {
  for (const folder of own) {
    const from = join(overlay, 'src', 'smart', folder, 'static');
    const to = join(PACKAGE_ROOT, 'src', 'smart', folder, 'static');
    rmSync(to, {force: true, recursive: true});
    if (existsSync(from)) cpSync(from, to, {recursive: true});
  }
}
process.exitCode = result.status ?? 1;
