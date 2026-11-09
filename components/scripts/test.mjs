#!/usr/bin/env node
// Usage: node scripts/test.mjs [--ui-source <checkout>] [--committed] [--overlay <directory>]
//
// The package's unit and contract suite. Lays the overlay (scripts/overlay.mjs:
// ui-source at the pinned revision with this repository over it) and runs, in
// it, every tests/*.test.mjs of this repository plus the free suite's
// cross-cutting checks listed below: those walk every src/smart folder, so in
// the overlay they hold the package components to the same rules as the free ones.
//
// The overlay defaults to .overlay/ in this repository (ignored by git) and is
// replaced on every run; the browser probes (scripts/run-browser-probes.mjs)
// reuse it.
import {spawnSync} from 'node:child_process';
import {readdirSync, rmSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {PACKAGE_ROOT, materializeOverlay} from './overlay.mjs';

// Free tests that scan src/smart (or the rule files) generically and stay
// true with the package components present. A free test that pins a count of the
// free product (the registry's 48, the 46 owner fixtures) or carries a package
// exemption the free contract no longer holds is not here; its package half is a
// test of this repository.
export const CROSS_CUTTING = [
  'alpha-scale.contract.test.mjs',
  'border-roles.contract.test.mjs',
  'change-event.contract.test.mjs',
  // change-lifecycle.contract.test.mjs is not here since standard 1.4: the
  // package manifests now list their former event names (alias_of), which the
  // free journal does not record; its package half is
  // tests/package-change-journal.contract.test.mjs.
  'component-inputs.contract.test.mjs',
  'component-naming.contract.test.mjs',
  'component-pixel-borders.test.mjs',
  'declared-enum-values.contract.test.mjs',
  'declared-tokens.contract.test.mjs',
  'disable-role.contract.test.mjs',
  'elevation-text.contract.test.mjs',
  'elevation.contract.test.mjs',
  'field-sizes.contract.test.mjs',
  'focus-ring-delegation.contract.test.mjs',
  'focus-ring-mechanism.contract.test.mjs',
  'icon-colour-roles.contract.test.mjs',
  'language-dictionaries.contract.test.mjs',
  'loader-class-match.contract.test.mjs',
  'loader-condition-points.contract.test.mjs',
  'loader-relation-completeness.contract.test.mjs',
  'loader-relations.contract.test.mjs',
  'manifest-defaults.contract.test.mjs',
  'motion-roles.contract.test.mjs',
  'motion-scale.contract.test.mjs',
  'muted-role.contract.test.mjs',
  'provenance-names-own-sources.contract.test.mjs',
  'public-api-axes.contract.test.mjs',
  'pure-runtime-dependencies.contract.test.mjs',
  'radius-roles.contract.test.mjs',
  'runtime-relations.contract.test.mjs',
  'sass-variable-modules.contract.test.mjs',
  'small-control-ladder.contract.test.mjs',
  'smart-manifest-schema.contract.test.mjs',
  'third-party-notices.contract.test.mjs',
  'token-derivation.contract.test.mjs',
  'typography-54-contract.test.mjs',
  'undeclared-prop-reads.contract.test.mjs',
  'utility-rule-imports.contract.test.mjs',
];

const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};
const overlay = resolve(option('--overlay') ?? join(PACKAGE_ROOT, '.overlay'));
rmSync(overlay, {force: true, recursive: true});
const laid = materializeOverlay(overlay, {uiSource: option('--ui-source'), committed: args.includes('--committed')});
process.stdout.write(`overlay ${overlay}: ui-source ${laid.sourceRevision.slice(0, 12)} + ${laid.laid} package files\n`);

// Free tests of CROSS_CUTTING files whose package half is a test of this
// repository: the frozen set folders (editor, view, view-table,
// view-properties) still carry names the pair keeps only as dated aliases, and
// tests/frozen-sets-former-names.contract.test.mjs asks the same of every
// package folder with that one exemption (pair ui-d6f01121baca, 2026-11-09).
// The loader-relations title names the set core since ui-cb287da78ab1; this
// package declares no core (package.json has no simai.core), so its half is
// the same check.
export const FREE_REPLACED = [
  'no first-party source asks a component for a value it does not declare',
  'loader: every related group a rule names exists as a rule, here, in the set core or in a required set',
  'every Smart rule forward is a former name that leads to a rule',
];
const escape = (name) => `^${name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}$`;

const own = readdirSync(join(PACKAGE_ROOT, 'tests')).filter((name) => name.endsWith('.test.mjs')).sort();
const files = [...own, ...CROSS_CUTTING].map((name) => join('tests', name));
const skip = FREE_REPLACED.flatMap((name) => ['--test-skip-pattern', escape(name)]);
const result = spawnSync(process.execPath, ['--test', ...skip, ...files], {
  cwd: overlay,
  stdio: 'inherit',
  env: {...process.env, SF_PACKAGE_ROOT: PACKAGE_ROOT},
});
process.exitCode = result.status ?? 1;
