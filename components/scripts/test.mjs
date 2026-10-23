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
  'change-lifecycle.contract.test.mjs',
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

const own = readdirSync(join(PACKAGE_ROOT, 'tests')).filter((name) => name.endsWith('.test.mjs')).sort();
const files = [...own, ...CROSS_CUTTING].map((name) => join('tests', name));
const result = spawnSync(process.execPath, ['--test', ...files], {cwd: overlay, stdio: 'inherit'});
process.exitCode = result.status ?? 1;
