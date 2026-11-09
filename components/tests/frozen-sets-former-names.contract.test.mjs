// The package half of three free checks that the frozen set folders cannot
// pass on their own (pair ui-d6f01121baca, 2026-11-09).
//
// The free suite holds every Smart source to the values its components declare
// (declared-enum-values), every rule relation to a rule that exists
// (loader-relations) and no rule to a former bundle name
// (loader-relation-completeness, the forward test). ui-pro runs those files in
// its overlay (scripts/test.mjs, CROSS_CUTTING), and three of their tests are
// replaced by this file (FREE_REPLACED there).
//
// The reason is the frozen folders. editor is the editor release
// editor-6b1736f863ee (tests/editor-folder-frozen.contract.test.mjs) and view,
// view-table and view-properties are the view release view-aea031ba718b
// (tests/view-folders-frozen.contract.test.mjs); they change only in
// simai/ui-editor and simai/ui-view. Those releases (and the ones before
// them, made over ui-0c23f6a0af12) still use, in places, names later pairs
// turned into former names:
// appearance="link" (now ghost, C15), status="error" on a button (now danger),
// scheme="secondary" on an icon button (now on-surface-variant), and the
// relation cl-button-group (now cl-segmented). Every one of them is a dated
// alias of the pair: the shim rewrites the value on the host, and the Loader
// installs the forward cl-button-group -> cl-segmented as a rule. So here, and
// only in a frozen folder, a former name is accepted while the pair still
// records it and its remove_after is ahead. Every other package folder is held
// to the free rule exactly. When the sets are released over the pair and taken
// in, the exemptions find nothing and this file is the free rule again.
import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {dirname, extname, join, relative, resolve} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

// The overlay: ui-source at the pin with this repository's folders over it.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// This repository's components folder, whose src/smart folders the overlay
// lays over ui-source (scripts/test.mjs passes it; the default overlay is
// components/.overlay).
const packageRoot = resolve(process.env.SF_PACKAGE_ROOT ?? join(root, '..'));
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const today = new Date().toISOString().slice(0, 10);

const FROZEN = new Set(['editor', 'view', 'view-table', 'view-properties']);

// The package's own Smart folders: those this repository lays over ui-source.
const packageFolders = () => {
  const own = resolve(packageRoot, 'src/smart');
  if (!existsSync(own)) return [];
  return readdirSync(own, {withFileTypes: true}).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
};

const ruleFolders = () => readdirSync(resolve(root, 'src/smart'), {withFileTypes: true})
  .filter((entry) => entry.isDirectory() && existsSync(resolve(root, 'src/smart', entry.name, 'rule.js')))
  .map((entry) => entry.name);

const relationsOf = (source) => [...source.matchAll(/relation:\s*\[([^\]]*)\]/gu)]
  .flatMap((block) => [...block[1].matchAll(/name:\s*['"]([^'"]+)['"]/gu)].map((m) => m[1]));

// The forwards the pair's Loader installs: former bundle name -> rule.
const forwards = () => new Map(Object.entries(JSON.parse(read('src/core/contracts/smart-rule-forwards.v1.json')).forwards));

test('package folders: the values they ask of a component are declared, or a frozen folder\'s dated former value', () => {
  const declared = new Map();
  for (const entry of readdirSync(resolve(root, 'src/smart'), {withFileTypes: true})) {
    const file = resolve(root, 'src/smart', entry.name, 'smart.manifest.json');
    if (!entry.isDirectory() || !existsSync(file)) continue;
    const manifest = JSON.parse(readFileSync(file, 'utf8'));
    if (!manifest.custom_element) continue;
    for (const [name, spec] of Object.entries(manifest.inputs?.properties ?? {})) {
      if (Array.isArray(spec?.enum)) declared.set(`${manifest.custom_element}|${name}`, new Set(spec.enum));
    }
  }
  assert.ok(declared.size > 50, `expected the manifests to declare enums, found ${declared.size}`);
  // Former values the pair still answers: journal records of kind value.
  const former = new Set();
  for (const record of JSON.parse(read('contracts/changes/journal.json')).records) {
    if (record.kind !== 'value' || !(record.remove_after > today)) continue;
    for (const item of record.items ?? []) {
      if (declared.get(`${item.component}|${item.attribute}`)?.has(item.to)) former.add(`${item.component}|${item.attribute}|${item.from}`);
    }
  }
  const sources = (directory) => readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name === 'static' ? [] : sources(path);
    return ['.js', '.mjs', '.css', '.html'].includes(extname(entry.name)) ? [path] : [];
  });
  const TAG = /<(sf-[a-z-]+)\b((?:[^<>])*?)>/gsu;
  const ATTRIBUTE = /\b([a-z-]+)="([a-z0-9/._-]+)"/gu;
  const wrong = [];
  for (const folder of packageFolders()) {
    const directory = resolve(root, 'src/smart', folder);
    if (!existsSync(directory)) continue;
    for (const file of sources(directory)) {
      for (const [, tag, attributes] of readFileSync(file, 'utf8').matchAll(TAG)) {
        for (const [, name, value] of attributes.matchAll(ATTRIBUTE)) {
          const allowed = declared.get(`${tag}|${name}`);
          if (!allowed || allowed.has(value)) continue;
          if (FROZEN.has(folder) && former.has(`${tag}|${name}|${value}`)) continue;
          wrong.push(`${relative(root, file)}: <${tag} ${name}="${value}"> — ${[...allowed].sort().join(', ')}`);
        }
      }
    }
  }
  assert.deepEqual([...new Set(wrong)].sort(), [], 'these values are not among the ones the component declares');
});

test('package rules: every relation is a rule, or in a frozen folder a forward the Loader still installs', () => {
  // Every rule of the tree (component, utility and Smart rules), as the free
  // loader-relations reads them.
  const rules = (directory) => readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return rules(path);
    return entry.name === 'rule.js' ? [path] : [];
  });
  const declared = new Set();
  for (const file of rules(resolve(root, 'src'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(/SF\.RuleLoader(?:\[['"]([^'"]+)['"]\]|\.([A-Za-z_$][\w$]*))\s*=/gu)) declared.add(match[1] || match[2]);
  }
  const forward = forwards();
  const dangling = [];
  for (const folder of packageFolders()) {
    const rule = `src/smart/${folder}/rule.js`;
    if (!existsSync(resolve(root, rule))) continue;
    for (const name of relationsOf(read(rule))) {
      if (declared.has(name)) continue;
      const to = forward.get(name);
      if (FROZEN.has(folder) && to && declared.has(to.to) && to.remove_after > today) continue;
      dangling.push(`smart/${folder}/rule.js -> ${name}`);
    }
  }
  assert.deepEqual(dangling, []);
});

test('every Smart rule forward is a former name that leads to a rule, and only a frozen folder still relates to one', () => {
  const ruleKeys = new Set();
  const relations = new Map();
  for (const folder of ruleFolders()) {
    const source = read(`src/smart/${folder}/rule.js`);
    for (const match of source.matchAll(/SF\.RuleLoader\[['"]([^'"]+)['"]\]/gu)) ruleKeys.add(match[1]);
    for (const name of new Set([...source.matchAll(/name:\s*['"]([^'"]+)['"]/gu)].map((m) => m[1]))) {
      relations.set(name, [...(relations.get(name) ?? []), folder]);
    }
  }
  const packageRules = new Map();
  const packages = resolve(root, 'src/core/contracts/packages');
  for (const file of readdirSync(packages).filter((one) => one.endsWith('.package.json'))) {
    const reference = JSON.parse(readFileSync(resolve(packages, file), 'utf8'));
    if (reference.alias_of) continue;
    for (const item of reference.provides) packageRules.set(item.rule_name, item);
  }
  const all = forwards();
  assert.ok(all.size >= 6, 'the forwards contract is read');
  for (const [name, {to}] of all) {
    assert.notEqual(name, to, `${name} forwards to itself`);
    assert.ok(!ruleKeys.has(name), `${name} is a forward and a rule`);
    const item = packageRules.get(to);
    assert.ok(ruleKeys.has(to) || item, `${name} forwards to ${to}, which is not a rule`);
    if (item && !ruleKeys.has(to)) {
      assert.ok((item.element_aliases ?? []).some((row) => `cl-${row.from.replace(/^sf-/u, '')}` === name), `${name} -> ${to}: the package reference lists the former tag whose bundle it was`);
    }
    const still = (relations.get(name) ?? []).filter((folder) => !FROZEN.has(folder));
    assert.deepEqual(still, [], `a rule still relates to the former name ${name}`);
  }
});
