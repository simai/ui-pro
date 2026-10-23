import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// A closed field schema and a renderer set that reads whatever it likes are two
// halves of one seam that can drift silently: the component keeps working,
// because a key it reads is simply undefined, while a host that validates its
// own answers against the port is refused for sending it. That is how
// `uploadText`, `formats` and `accept` reached a consumer stand -- read by the
// file renderer since 1.3.0, declared by no port until 1.5.0. This check reads
// the keys out of the sources rather than from a list someone maintains, so a
// renderer that starts reading a new key fails here until the port declares it.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const json = (path) => JSON.parse(read(path));

const sources = [
  'src/smart/field-renderers/index.js',
  'src/smart/property-view/index.js',
  'src/smart/property-view/js/templates/default.js',
];

// Keys a property-view host never sends, each with the reason it is not part of
// this port. An entry here is a decision, not a silence.
const notInThisPort = new Map([
  ['filter', 'the filter-row descriptor a data view builds for a column; a property-view field has no filter'],
  ['type', 'a legacy alias of propertyType, read as a fallback for older hosts; propertyType is the name this port declares'],
  ['dataType', 'a second legacy alias of propertyType, kept for the same reason and declared under neither name'],
]);

const portPath = json('src/smart/property-view/smart.manifest.json')
  .composition.declarative.host_port.path;
const fieldSchema = json(portPath)
  .data.record.schema.properties.sections.items.properties.groups.items.properties.fields.items;

test('the port declares every field key the renderers read', () => {
  assert.equal(fieldSchema.additionalProperties, false, 'the field schema is closed, which is what makes an undeclared key a refusal');

  const declared = new Set(Object.keys(fieldSchema.properties));
  const found = new Map();
  for (const path of sources) {
    for (const [, key] of read(path).matchAll(/(?<!["'`])\bfield\.([A-Za-z][A-Za-z0-9]*)\b/gu)) {
      if (!found.has(key)) found.set(key, path);
    }
  }

  assert.ok(found.size > 10, 'the sweep found the field reads rather than nothing');

  const undeclared = [...found]
    .filter(([key]) => !declared.has(key) && !notInThisPort.has(key))
    .map(([key, path]) => `${key} (read in ${path})`);

  assert.deepEqual(undeclared, [], `undeclared field keys: a host sending one of these is refused by a schema that closed itself. Declare it in ${portPath} or record why this port does not carry it.`);
});

test('every key excused from the port is still absent from it', () => {
  // An excuse that outlives the reason for it is worse than no excuse: the next
  // person reads the list and believes a declared key is undeclared.
  for (const [key, reason] of notInThisPort) {
    assert.ok(reason.length > 20, `${key}: the reason is written out`);
    assert.ok(!Object.hasOwn(fieldSchema.properties, key), `${key} is declared in the port now, so remove it from the excused list`);
  }
});
