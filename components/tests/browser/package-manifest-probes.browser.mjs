#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output [folder ...]
// Build output root is required: the free output with the package laid into
// smart/smart (scripts/run-browser-probes.mjs makes it).
//
// The conformance probes of the package's components (standard
// simai.smart-component 1.3.8 §12, gate 20): every src/smart/<folder>/probe.json
// of this package, run by the SIMAI Framework's own runner
// (tests/browser/manifest-probes.browser.mjs of the pinned ui-source, here in
// the overlay) on the built bytes with the real Loader. The one difference is
// the page: it declares the package before the core starts, as a consumer's page
// does (README «Building the package»), so the Loader finds the package's tags.
// The name declared is the one the build registers (pro; larena for a build
// under the former name, which a Framework pair from before 2026-11-02 needs).
import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

if (!process.argv[2]) throw new Error('Build output root is required');
const here = dirname(fileURLToPath(import.meta.url));
const runner = join(here, 'manifest-probes.browser.mjs');
const FREE_BOOT = "window.SF_BOOT_CONFIG={preloader:{enabled:false}};";
const ruleFile = join(process.argv[2], 'smart', 'smart', 'rule.js');
const registered = existsSync(ruleFile) ? /registerPackage\(\s*["']([a-z][a-z0-9-]*)["']/u.exec(readFileSync(ruleFile, 'utf8')) : null;
const PACKAGE_BOOT = `window.SF_BOOT_CONFIG={preloader:{enabled:false},packages:{${registered ? registered[1] : 'pro'}:{base:'/distr/smart'}}};`;
const source = readFileSync(runner, 'utf8');
if (!source.includes(FREE_BOOT)) throw new Error('the Framework runner no longer boots the page as this wrapper expects');
const PACKAGE = ['admin-menu', 'change-confirm', 'chat-composer', 'chat-interlocutor', 'chat-message', 'chat-window', 'content-editor', 'data-view', 'mail-canvas', 'mail-inspector', 'mail-letters', 'mail-structure', 'mail-library', 'message-log', 'property-view', 'table', 'thread-list'];
const asked = process.argv.slice(3);
const folders = (asked.length ? asked : PACKAGE).filter((folder) => existsSync(join(here, '..', '..', 'src', 'smart', folder, 'probe.json')));
if (!folders.length) throw new Error('no package component has a probe.json');
const copy = join(here, '.package-manifest-probes.mjs');
writeFileSync(copy, source.replace(FREE_BOOT, PACKAGE_BOOT));
try {
  const run = spawnSync(process.execPath, [copy, resolve(process.argv[2]), ...folders], {stdio: 'inherit'});
  process.exitCode = run.status ?? 1;
} finally {
  rmSync(copy, {force: true});
}
