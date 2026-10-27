import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import test from 'node:test';
import {URL} from 'node:url';

// ui-studio lists a component's examples from its manifest, not from the
// folder: a studio.fixture.json the manifest does not name is never shown, and
// a name without its file breaks the listing. The three conversation
// components shipped their fixtures with an empty list (found by ui-studio on
// larena-7545782e2459), so the two are held together here.
const smart = new URL('../src/smart/', import.meta.url);

test('every studio fixture and scenario in a folder is listed by its manifest, and every listed one exists', () => {
  const problems = [];
  for (const name of readdirSync(smart)) {
    const manifestUrl = new URL(`${name}/smart.manifest.json`, smart);
    if (!existsSync(manifestUrl)) continue;
    const artifacts = JSON.parse(readFileSync(manifestUrl, 'utf8')).artifacts ?? {};
    for (const [kind, file] of [['fixtures', 'studio.fixture.json'], ['scenarios', 'studio.scenario.json']]) {
      const listed = artifacts[kind] ?? [];
      const present = existsSync(new URL(`${name}/${file}`, smart));
      if (present && !listed.includes(file)) problems.push(`${name}: ${file} exists but artifacts.${kind} does not name it`);
      for (const entry of listed) {
        if (!existsSync(new URL(`${name}/${entry}`, smart))) problems.push(`${name}: artifacts.${kind} names ${entry}, which is missing`);
      }
    }
  }
  assert.deepEqual(problems, []);
});
