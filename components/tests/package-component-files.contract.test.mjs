// Standard simai.smart-component 1.4, phase A, for the package components:
// a person writes component.json, examples.json, index.js, lang/ and docs.md;
// rule.js, aliases.json, meta.mjs, studio.fixture.json, studio.scenario.json,
// probe.json and smart.manifest.json are generated from them by ui-source's
// scripts/generate-component-files.mjs -- the same script the free components
// use, at the revision framework.lock.json pins (this test runs in the
// overlay, where that script is). A generated file edited by hand, or a
// component.json changed without regenerating, fails here.
//
// To regenerate one component, from a ui-source checkout at the pinned revision:
//   node scripts/generate-component-files.mjs --write --package <ui-pro>/components --component <name>
// then refresh the manifest's provenance digests
// (ui-control tools/release/refresh-provenance.py <ui-pro>/components).
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import test from 'node:test';
import {run} from '../scripts/generate-component-files.mjs';

const root = resolve(import.meta.dirname, '..');

// The package folders in the 1.4 form: every generated file is byte for byte
// what the generator writes.
const PHASE_A = ['chat-composer', 'chat-interlocutor', 'chat-message', 'chat-window', 'change-confirm', 'message-log', 'thread-list', 'property-view', 'admin-menu', 'data-view'];

// The package folders still in the 1.3 form: the five files the generator
// already gives back (rule.js, aliases.json, the fixture, the scenario,
// probe.json) must stay equal to it; smart.manifest.json and meta.mjs follow
// when the folder converts.
const PENDING = ['table'];
const CHECKED = ['rule.js', 'aliases.json', 'studio.fixture.json', 'studio.scenario.json', 'probe.json'];

// Gate 1 (§4): the top-level fields of component.json are a closed list; 1.4
// adds relations and aliases. A tool's field starts with x-, $comment is kept.
const TOP_FIELDS = ['id', 'tag', 'version', 'kind', 'family', 'package', 'traits', 'implements', 'settings', 'values', 'events',
  'actions', 'keys', 'roles', 'rules', 'layouts', 'slots', 'form', 'validity', 'selection', 'entry-state', 'window', 'computed',
  'layer', 'side-effects', 'keyboard', 'port', 'connects', 'templates', 'presentation', 'styles', 'examples', 'docs', 'lang',
  'accessibility', 'host-states', 'css-variables', 'parts', 'relations', 'aliases'];

const results = (await run({packages: [root], components: [...PHASE_A, ...PENDING]}))
  .filter((result) => [...PHASE_A, ...PENDING].includes(result.component));

test('every package component is listed once, as converted or pending', () => {
  assert.deepEqual(results.map((result) => result.component).sort(), [...PHASE_A, ...PENDING].sort());
  assert.deepEqual(PHASE_A.filter((name) => PENDING.includes(name)), []);
});

test('phase A package folders are in the 1.4 form and generate every file byte for byte', () => {
  const problems = [];
  for (const name of PHASE_A) {
    const result = results.find((item) => item.component === name);
    if (result.error) { problems.push(`${name}: ${result.error}`); continue; }
    if (result.log?.form !== '1.4') problems.push(`${name}: component.json has no relations (not in the 1.4 form)`);
    for (const [file, entry] of Object.entries(result.files)) {
      if (entry.status !== 'identical') problems.push(`${name}/${file}: ${entry.status}${entry.differences ? ` (${entry.differences.slice(0, 3).map((d) => d.path).join(', ')})` : ''}`);
    }
    for (const field of Object.keys(result.view?.component ?? {})) {
      if (field === '$comment' || field === 'folder' || field.startsWith('x-') || TOP_FIELDS.includes(field)) continue;
      problems.push(`${name}/component.json: unknown top-level field ${field} (gate 1, §4)`);
    }
  }
  assert.deepEqual(problems, [], 'edit component.json or examples.json, then generate-component-files --write --component <name>');
});

test('a package folder in the 1.4 form is listed in phase A', () => {
  const unlisted = results.filter((result) => result.log?.form === '1.4' && !PHASE_A.includes(result.component)).map((result) => result.component);
  assert.deepEqual(unlisted, []);
});

test(`pending package folders: ${CHECKED.join(', ')} equal the generated ones`, () => {
  const drifted = [];
  for (const name of PENDING) {
    const result = results.find((item) => item.component === name);
    if (result.error) { drifted.push(`${name}: ${result.error}`); continue; }
    for (const file of CHECKED) {
      const entry = result.files[file];
      if (!entry || entry.status === 'identical' || entry.status === 'semantic') continue;
      drifted.push(`${name}/${file}: ${entry.status}`);
    }
  }
  assert.deepEqual(drifted, []);
});
