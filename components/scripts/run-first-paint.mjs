#!/usr/bin/env node
// Usage: node scripts/run-first-paint.mjs snapshot|check|gate <free output> <package output> [folder ...] [--overlay <directory>]
//
// The first paint of the package components (standard simai.smart-component
// 1.3.9 §5.4, §7.3, gate 24), with ui-source's own tools at the pinned
// revision, from the overlay:
//
//   snapshot  scripts/snapshot-first-paint.mjs: renders every example from the
//             built bytes and writes src/smart/<folder>/static/ here (the
//             static markup, the skeletons, static/sheets.json);
//   check     the same with --check: fails when a committed snapshot is stale,
//             missing or over its size;
//   gate      tests/browser/first-paint-gate.browser.mjs: the first paint
//             holds still through the HTML and sheets, the code and the data
//             (late settings, or the fake port an example declares), at 1280
//             and 390 px.
//
// The tools take the package as a declaration (ui-source first-paint-lib.mjs
// readConfig, since c020caa): this script writes it -- the package output
// served under /distr/smart/ after the free output, as the package's sheets
// address the free ones beside them -- and passes --config. Nothing of the
// tools is copied or edited. <free output> is a product output root
// (core/core, smart/smart, ...) or the `distr` of the ui distribution; a
// distr is laid out as a product root with symbolic links.
import {spawnSync} from 'node:child_process';
import {cpSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
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
if (!existsSync(join(overlay, 'scripts', 'first-paint-lib.mjs'))) throw new Error(`${overlay} holds no ui-source first-paint tools`);
const own = folders.length ? folders : PACKAGE_COMPONENTS;
for (const folder of own) if (!PACKAGE_COMPONENTS.includes(folder)) throw new Error(`${folder} is not a package component`);

// The free output as a product root: as given, or a distr linked into one.
let root = free;
if (!existsSync(join(free, 'core', 'core', 'js', 'core.js'))) {
  if (!existsSync(join(free, 'core', 'js', 'core.js'))) throw new Error(`no core/js/core.js under ${free} (a product output root or a ui distr)`);
  root = join(overlay, '.first-paint-output');
  rmSync(root, {force: true, recursive: true});
  const products = {core: ['core', 'core'], rule: ['core', 'rule'], component: ['component', 'component'], smart: ['smart', 'smart'], utility: ['utility', 'utility']};
  for (const [product, [folder, inner]] of Object.entries(products)) {
    if (!existsSync(join(free, product))) throw new Error(`the free output has no ${product}: ${free}`);
    mkdirSync(join(root, folder), {recursive: true});
    symlinkSync(join(free, product), join(root, folder, inner));
  }
}

// The package, declared.
const config = join(overlay, '.first-paint-config.json');
writeFileSync(config, `${JSON.stringify({packages: {larena: {output: join(built, 'smart'), base: '/distr/smart/'}}}, null, 2)}\n`);

const tool = mode === 'gate' ? 'tests/browser/first-paint-gate.browser.mjs' : 'scripts/snapshot-first-paint.mjs';
const result = spawnSync(process.execPath, [tool, root, `--config=${config}`, ...own, ...(mode === 'check' ? ['--check'] : [])], {cwd: overlay, stdio: 'inherit'});

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
