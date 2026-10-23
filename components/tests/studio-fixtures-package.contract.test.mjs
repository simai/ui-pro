import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

// ui-source tests/smart-studio-metadata-contract.test.mjs checks every owner
// reference fixture under src/smart; the two package components that carry one are
// checked here, so the free count (45) and this one add up to the 47 there were.
const json = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));

test('the package owner reference fixtures use declared component inputs and meaningful data', async () => {
  for (const name of ['table', 'admin-menu']) {
    const manifest = await json(`src/smart/${name}/smart.manifest.json`);
    const fixture = await json(`src/smart/${name}/studio.fixture.json`);
    const properties = manifest.inputs.properties;
    assert.deepEqual(Object.keys(fixture.props).filter((key) => !(key in properties)), [], `${manifest.id} fixture has unknown inputs`);
    const values = [...Object.values(fixture.props), ...fixture.children.flatMap((child) => [child.text, ...Object.values(child.props)])];
    assert.ok(values.some((value) => value === true || (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && value.trim().length > 0)), `${manifest.id} fixture has no meaningful demonstration data`);
  }
});
